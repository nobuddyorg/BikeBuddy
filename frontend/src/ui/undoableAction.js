import * as i18n from './i18n.js';
import { toast } from './toast.js';

const t = i18n.t;

const UNDO_GRACE_MS = 6000;

// The request waits for the Undo window, so Undo needs no server-side restore.
export function scheduleUndoable({ message, commit, revert }) {
  let undone = false;
  const timer = setTimeout(commit, UNDO_GRACE_MS);
  toast(message, {
    type: 'success',
    durationMs: UNDO_GRACE_MS,
    action: {
      label: t('toast.undo'),
      onClick: () => {
        if (undone) return;
        undone = true;
        clearTimeout(timer);
        revert();
      },
    },
  });
}
