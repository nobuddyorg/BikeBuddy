import { describe, it, expect, vi } from 'vitest';
import { createPendingActions } from '../src/lib/pendingActions.js';

function setUp() {
  const timers = new Map();
  let nextId = 0;
  const pendingActions = createPendingActions({
    setTimer: (callback, delayMs) => {
      nextId += 1;
      timers.set(nextId, { callback, delayMs });
      return nextId;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const fire = () => [...timers.values()].forEach(({ callback }) => callback());
  return { pendingActions, timers, fire };
}

describe('createPendingActions', () => {
  it('commits once the grace period ends, and not before', () => {
    const { pendingActions, timers, fire } = setUp();
    const commit = vi.fn();

    pendingActions.schedule({ commit, delayMs: 6000 });

    expect(commit).not.toHaveBeenCalled();
    expect([...timers.values()].map((timer) => timer.delayMs)).toEqual([6000]);
    fire();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('never commits an undone action, and a second undo changes nothing', () => {
    const { pendingActions, timers } = setUp();
    const commit = vi.fn();

    const action = pendingActions.schedule({ commit, delayMs: 6000 });

    expect(action.undo()).toBe(true);
    expect(action.undo()).toBe(false);
    expect(timers.size).toBe(0);
    pendingActions.flushAll();
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits every pending action at once on a flush, each only once', () => {
    const { pendingActions, timers, fire } = setUp();
    const first = vi.fn();
    const second = vi.fn();
    pendingActions.schedule({ commit: first, delayMs: 6000 });
    pendingActions.schedule({ commit: second, delayMs: 6000 });

    pendingActions.flushAll();
    fire();
    pendingActions.flushAll();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(0);
  });

  it('no longer undoes an action once it committed', () => {
    const { pendingActions } = setUp();
    const commit = vi.fn();

    const action = pendingActions.schedule({ commit, delayMs: 6000 });
    pendingActions.flushAll();

    expect(action.undo()).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('names the keys of the actions still pending', () => {
    const { pendingActions } = setUp();
    const kept = pendingActions.schedule({ keys: ['a', 'b'], commit: vi.fn(), delayMs: 1 });
    pendingActions.schedule({ keys: ['c'], commit: vi.fn(), delayMs: 1 });
    pendingActions.schedule({ commit: vi.fn(), delayMs: 1 });

    expect(pendingActions.pendingKeys()).toEqual(new Set(['a', 'b', 'c']));
    kept.undo();
    expect(pendingActions.pendingKeys()).toEqual(new Set(['c']));
    pendingActions.flushAll();
    expect(pendingActions.pendingKeys()).toEqual(new Set());
  });
});
