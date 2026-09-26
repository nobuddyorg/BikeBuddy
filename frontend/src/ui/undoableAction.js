import * as i18n from './i18n.js';
import { toast } from './toast.js';
import { createPendingActions } from '../lib/pendingActions.js';

const t = i18n.t;

const UNDO_GRACE_MS = 6000;

const pendingActions = createPendingActions({
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
});

// A hidden page may never come back (a closed tab, a phone app switcher): what is still pending
// goes now, with keepalive requests, instead of with the timer that would be lost (#559).
window.addEventListener('pagehide', () => pendingActions.flushAll());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pendingActions.flushAll();
});

/** What the pending actions are about, so a refetch in the Undo window does not bring it back. */
export const pendingKeys = () => pendingActions.pendingKeys();

// The request waits for the Undo window, so Undo needs no server-side restore.
export function scheduleUndoable({ message, commit, revert, keys = [] }) {
  const action = pendingActions.schedule({ keys, commit, delayMs: UNDO_GRACE_MS });
  toast(message, {
    type: 'success',
    durationMs: UNDO_GRACE_MS,
    action: {
      label: t('toast.undo'),
      onClick: () => {
        if (action.undo()) revert();
        else toast(t('toast.undoTooLate'), { type: 'error' });
      },
    },
  });
}
