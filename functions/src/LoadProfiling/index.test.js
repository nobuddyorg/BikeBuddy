'use strict';

const { setUp } = require('./index');

function fakeProfiling(on) {
  return { enabled: () => on, registerInvocationHooks: vi.fn(), startSampling: vi.fn() };
}

describe('LoadProfiling', () => {
  it('stays off unless enabled (and is off when loaded in tests)', () => {
    const lib = fakeProfiling(false);
    expect(setUp({}, lib)).toBe(false);
    expect(lib.registerInvocationHooks).not.toHaveBeenCalled();
    expect(lib.startSampling).not.toHaveBeenCalled();
  });

  it('registers the hooks and starts sampling when enabled', () => {
    const lib = fakeProfiling(true);
    const app = { hook: {} };
    expect(setUp(app, lib)).toBe(true);
    expect(lib.registerInvocationHooks).toHaveBeenCalledWith(app);
    expect(lib.startSampling).toHaveBeenCalled();
  });
});
