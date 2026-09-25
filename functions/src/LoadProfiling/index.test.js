'use strict';

const { isEnabled } = require('../lib/profiling');
const { setUp } = require('./index');

function fakeInstrumentation() {
  return { isEnabled, registerInvocationHooks: vi.fn(), startSampling: vi.fn() };
}

describe('LoadProfiling', () => {
  it('stays off unless LOAD_PROFILING=true', () => {
    const instrumentation = fakeInstrumentation();

    expect(setUp({ functionsApp: {}, environment: {}, instrumentation })).toBe(false);
    expect(instrumentation.registerInvocationHooks).not.toHaveBeenCalled();
    expect(instrumentation.startSampling).not.toHaveBeenCalled();
  });

  it('registers the hooks and samples real memory when enabled', () => {
    const instrumentation = fakeInstrumentation();
    const functionsApp = { hook: {} };

    const started = setUp({
      functionsApp,
      environment: { LOAD_PROFILING: 'true' },
      instrumentation,
    });

    expect(started).toBe(true);
    const [hookedApp, { now }] = instrumentation.registerInvocationHooks.mock.calls[0];
    expect(hookedApp).toBe(functionsApp);
    expect(now()).toBeGreaterThan(0);
    const [{ readMemory }] = instrumentation.startSampling.mock.calls[0];
    expect(readMemory().rss).toBeGreaterThan(0);
  });

  it('writes each record as one console line', () => {
    const instrumentation = fakeInstrumentation();
    setUp({ functionsApp: {}, environment: { LOAD_PROFILING: 'true' }, instrumentation });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const [{ write }] = instrumentation.startSampling.mock.calls[0];
      write('LOADPROF {}');
      expect(log).toHaveBeenCalledWith('LOADPROF {}');
    } finally {
      log.mockRestore();
    }
  });
});
