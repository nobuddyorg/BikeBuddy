import * as i18n from './i18n.js';
import { toast } from './toast.js';

const t = i18n.t;

// How long the Undo toast stays up, and so how long the request waits.
const UNDO_GRACE_MS = 6000;

// The UI change has already happened; the server request only runs once the
// Undo window closes, so Undo just cancels it and reverts the UI — no
// server-side restore needed.
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
