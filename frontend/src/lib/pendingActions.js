// @ts-check

/**
 * Actions that commit after a grace period unless undone, and all at once when the page goes away:
 * a delete held only in a timer is lost with the tab (#559).
 *
 * @param {{ setTimer: (callback: () => void, delayMs: number) => unknown,
 *   clearTimer: (timer: unknown) => void }} timers
 */
export function createPendingActions({ setTimer, clearTimer }) {
  /** @type {Set<{ keys: string[], commit: () => unknown, timer?: unknown }>} */
  const pending = new Set();

  // Its timer is cleared here and on undo, so an entry commits at most once.
  function commitNow(entry) {
    pending.delete(entry);
    clearTimer(entry.timer);
    entry.commit();
  }

  /**
   * @param {{ keys?: string[], commit: () => unknown, delayMs: number }} action `keys` name what
   *   the action is about, for pendingKeys
   * @returns {{ undo: () => boolean }} undo answers whether it still stopped the commit
   */
  function schedule({ keys = [], commit, delayMs }) {
    const entry = { keys, commit };
    entry.timer = setTimer(() => commitNow(entry), delayMs);
    pending.add(entry);
    return {
      undo: () => {
        if (!pending.delete(entry)) return false;
        clearTimer(entry.timer);
        return true;
      },
    };
  }

  return {
    schedule,
    flushAll: () => [...pending].forEach(commitNow),
    pendingKeys: () => new Set([...pending].flatMap((entry) => entry.keys)),
  };
}
