'use strict';

const {
  PREFIX,
  enabled,
  emit,
  bodyBytes,
  registerInvocationHooks,
  startSampling,
  cosmosPlugin,
  blobPolicyFactory,
  currentHandler,
} = require('./profiling');

const records = (write) => write.mock.calls.map(([line]) => JSON.parse(line.slice(PREFIX.length)));

describe('profiling', () => {
  afterEach(() => {
    delete process.env.LOAD_PROFILING;
    vi.useRealTimers();
  });

  it('is enabled only by LOAD_PROFILING=true', () => {
    expect(enabled()).toBe(false);
    process.env.LOAD_PROFILING = 'yes';
    expect(enabled()).toBe(false);
    process.env.LOAD_PROFILING = 'true';
    expect(enabled()).toBe(true);
  });

  it('emits one prefixed JSON line per record', () => {
    const write = vi.fn();
    emit({ type: 'x', n: 1 }, write);
    expect(write).toHaveBeenCalledWith('LOADPROF {"type":"x","n":1}');
  });

  it('writes to console.log by default', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    emit({ type: 'x' });
    expect(log).toHaveBeenCalledWith('LOADPROF {"type":"x"}');
    log.mockRestore();
  });

  it.each([
    [undefined, 0],
    ['text', 0],
    [{ status: 204 }, 0],
    [{ jsonBody: { a: 'ü' } }, Buffer.byteLength('{"a":"ü"}')],
    [{ body: 'hello' }, 5],
    [{ body: Buffer.from([1, 2, 3]) }, 3],
    [{ body: { stream: true } }, 0],
  ])('measures the response body of %j as %i bytes', (result, bytes) => {
    expect(bodyBytes(result)).toBe(bytes);
  });

  describe('invocation hooks', () => {
    function fakeApp() {
      const hooks = {};
      return {
        hooks,
        app: {
          hook: {
            preInvocation: (fn) => (hooks.pre = fn),
            postInvocation: (fn) => (hooks.post = fn),
          },
        },
      };
    }

    it('runs the handler inside its context and records status, duration and bytes', async () => {
      const { app, hooks } = fakeApp();
      const write = vi.fn();
      const times = [10, 35];
      registerInvocationHooks(app, () => times.shift(), write);

      const pre = {
        invocationContext: { functionName: 'GetTours' },
        functionHandler: async () => currentHandler(),
        hookData: {},
      };
      hooks.pre(pre);
      expect(await pre.functionHandler()).toBe('GetTours');

      hooks.post({
        invocationContext: { functionName: 'GetTours' },
        hookData: pre.hookData,
        result: { status: 201, jsonBody: [1] },
      });
      expect(records(write)).toEqual([
        { type: 'invocation', handler: 'GetTours', status: 201, ms: 25, bytes: 3 },
      ]);
    });

    it('records a thrown error as a 500 and a bare result as a 200', () => {
      const { app, hooks } = fakeApp();
      const write = vi.fn();
      registerInvocationHooks(app, () => 0, write);
      const base = { invocationContext: { functionName: 'H' }, hookData: { startedAt: 0 } };
      hooks.post({ ...base, error: new Error('boom'), result: undefined });
      hooks.post({ ...base, result: undefined });
      expect(records(write).map((r) => r.status)).toEqual([500, 200]);
    });

    it('uses performance.now and console.log by default', async () => {
      const { app, hooks } = fakeApp();
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      registerInvocationHooks(app);
      const pre = {
        invocationContext: { functionName: 'H' },
        functionHandler: async () => 1,
        hookData: {},
      };
      hooks.pre(pre);
      hooks.post({ invocationContext: { functionName: 'H' }, hookData: pre.hookData, result: {} });
      expect(log.mock.calls[0][0]).toMatch(/^LOADPROF \{"type":"invocation","handler":"H"/);
      log.mockRestore();
    });
  });

  it('reports no handler outside an invocation', () => {
    expect(currentHandler()).toBe('none');
  });

  it('samples event-loop delay and memory on an interval', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const timer = startSampling(write, 1000);
    vi.advanceTimersByTime(2000);
    clearInterval(timer);
    const samples = records(write);
    expect(samples).toHaveLength(2);
    expect(samples[0]).toEqual(
      expect.objectContaining({
        type: 'sample',
        loopP99Ms: expect.any(Number),
        loopMaxMs: expect.any(Number),
        rssMb: expect.any(Number),
        heapUsedMb: expect.any(Number),
      }),
    );
  });

  it('samples with the default writer and interval', () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const timer = startSampling();
    vi.advanceTimersByTime(5000);
    clearInterval(timer);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  describe('cosmos plugin', () => {
    it('records each request with its request charge and duration', async () => {
      const write = vi.fn();
      const times = [100, 112];
      const plugin = cosmosPlugin(write, () => times.shift());
      const response = { headers: { 'x-ms-request-charge': '2.83' }, result: 'r' };
      const next = vi.fn(async () => response);
      const context = { operationType: 'query', resourceType: 'docs' };

      await expect(plugin(context, {}, next)).resolves.toBe(response);
      expect(next).toHaveBeenCalledWith(context);
      expect(records(write)).toEqual([
        { type: 'cosmos', handler: 'none', op: 'query docs', ru: 2.83, ms: 12 },
      ]);
    });

    it('tolerates a response without headers or an unknown operation', async () => {
      const write = vi.fn();
      const plugin = cosmosPlugin(write, () => 0);
      await plugin({}, {}, async () => ({}));
      expect(records(write)[0]).toEqual(expect.objectContaining({ op: '? ?', ru: 0 }));
    });

    it('defaults to console.log and performance.now', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      await cosmosPlugin()({ operationType: 'read', resourceType: 'docs' }, {}, async () => ({
        headers: {},
      }));
      expect(log.mock.calls[0][0]).toMatch(/"op":"read docs"/);
      log.mockRestore();
    });
  });

  describe('blob policy factory', () => {
    const through = (factory, response) =>
      factory.create({ sendRequest: vi.fn(async () => response) });

    it.each([
      ['http://127.0.0.1:10000/devstoreaccount1/tour-images/u/t/i.jpg', 'PUT blob'],
      ['http://127.0.0.1:10000/devstoreaccount1/tour-images?restype=container', 'PUT container'],
    ])('records %s as %s', async (url, op) => {
      const write = vi.fn();
      const policy = through(blobPolicyFactory(write), { status: 201 });
      await expect(policy.sendRequest({ method: 'PUT', url })).resolves.toEqual({ status: 201 });
      expect(records(write)).toEqual([{ type: 'blob', handler: 'none', op, status: 201 }]);
    });

    it('records a request that failed with its status code, then rethrows', async () => {
      const write = vi.fn();
      const error = Object.assign(new Error('exists'), { statusCode: 409 });
      const policy = blobPolicyFactory(write).create({
        sendRequest: vi.fn().mockRejectedValue(error),
      });
      const url = 'http://h/acct/c?restype=container';
      await expect(policy.sendRequest({ method: 'PUT', url })).rejects.toBe(error);
      expect(records(write)).toEqual([
        { type: 'blob', handler: 'none', op: 'PUT container', status: 409 },
      ]);
    });

    it('records a failure without a status code as 0', async () => {
      const write = vi.fn();
      const policy = blobPolicyFactory(write).create({
        sendRequest: vi.fn().mockRejectedValue(new Error('socket hang up')),
      });
      await expect(policy.sendRequest({ method: 'GET', url: 'http://h/a/c/b' })).rejects.toThrow();
      expect(records(write)[0].status).toBe(0);
    });

    it('writes to console.log by default', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const policy = through(blobPolicyFactory(), { status: 200 });
      await policy.sendRequest({ method: 'GET', url: 'http://h/acct/c/b' });
      expect(log.mock.calls[0][0]).toMatch(/"op":"GET blob"/);
      log.mockRestore();
    });
  });
});
