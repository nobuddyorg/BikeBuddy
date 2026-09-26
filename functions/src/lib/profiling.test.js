'use strict';

const {
  PREFIX,
  isEnabled,
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
    vi.useRealTimers();
  });

  it('is enabled only by LOAD_PROFILING=true', () => {
    expect(isEnabled({})).toBe(false);
    expect(isEnabled({ LOAD_PROFILING: 'yes' })).toBe(false);
    expect(isEnabled({ LOAD_PROFILING: 'true' })).toBe(true);
  });

  it('emits one prefixed JSON line per record', () => {
    const write = vi.fn();
    emit({ type: 'x', count: 1 }, write);
    expect(write).toHaveBeenCalledWith('LOADPROF {"type":"x","count":1}');
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
            preInvocation: (hook) => (hooks.pre = hook),
            postInvocation: (hook) => (hooks.post = hook),
          },
        },
      };
    }

    it('runs the handler inside its context and records status, duration and bytes', async () => {
      const { app, hooks } = fakeApp();
      const write = vi.fn();
      const times = [10, 35];
      registerInvocationHooks(app, { now: () => times.shift(), write });

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
      registerInvocationHooks(app, { now: () => 0, write });
      const base = { invocationContext: { functionName: 'H' }, hookData: { startedAt: 0 } };
      hooks.post({ ...base, error: new Error('boom'), result: undefined });
      hooks.post({ ...base, result: undefined });
      expect(records(write).map((record) => record.status)).toEqual([500, 200]);
    });
  });

  it('reports no handler outside an invocation', () => {
    expect(currentHandler()).toBe('none');
  });

  it('samples event-loop delay and memory in megabytes on an interval', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const readMemory = () => ({ rss: 3 * 2 ** 20, heapUsed: 2 ** 19 });
    const timer = startSampling({ write, readMemory, intervalMs: 1000 });
    vi.advanceTimersByTime(2000);
    clearInterval(timer);
    const samples = records(write);
    expect(samples).toHaveLength(2);
    expect(samples[0]).toEqual({
      type: 'sample',
      loopP50Ms: expect.any(Number),
      loopP99Ms: expect.any(Number),
      loopMaxMs: expect.any(Number),
      rssMb: 3,
      heapUsedMb: 0.5,
    });
  });

  it('samples every five seconds by default', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const timer = startSampling({ write, readMemory: () => ({ rss: 0, heapUsed: 0 }) });
    vi.advanceTimersByTime(4999);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    clearInterval(timer);
    expect(write).toHaveBeenCalledTimes(1);
  });

  describe('cosmos plugin', () => {
    it('records each request with its request charge and duration', async () => {
      const write = vi.fn();
      const times = [100, 112];
      const plugin = cosmosPlugin({ write, now: () => times.shift() });
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
      const plugin = cosmosPlugin({ write, now: () => 0 });
      await plugin({}, {}, async () => ({}));
      expect(records(write)[0]).toEqual(expect.objectContaining({ op: '? ?', ru: 0 }));
    });
  });

  describe('blob policy factory', () => {
    const through = (factory, response) =>
      factory.create({ sendRequest: vi.fn(async () => response) });

    it.each([
      ['http://127.0.0.1:10000/devstoreaccount1/tour-images/u/t/i.jpg', 'PUT blob'],
      ['http://127.0.0.1:10000/devstoreaccount1/tour-images?restype=container', 'PUT container'],
    ])('records %s as %s', async (url, operation) => {
      const write = vi.fn();
      const policy = through(blobPolicyFactory(write), { status: 201 });
      await expect(policy.sendRequest({ method: 'PUT', url })).resolves.toEqual({ status: 201 });
      expect(records(write)).toEqual([
        { type: 'blob', handler: 'none', op: operation, status: 201 },
      ]);
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
  });
});
