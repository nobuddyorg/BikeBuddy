import { openModal, closeModal, wireModalClose } from './modal.js';
import {
  confirmModal,
  confirmTitle,
  confirmMessage,
  confirmOkButton,
  confirmCancelButton,
  confirmCloseButton,
} from './dom.js';

const settleNothing = () => {};
let resolvePending = settleNothing;

function finish(result) {
  closeModal(confirmModal);
  const resolve = resolvePending;
  resolvePending = settleNothing;
  resolve(result);
}

// Exported so app.js's global Escape/Back handling can cancel like any other
// close, instead of leaving a promise unresolved.
export const cancelConfirm = () => finish(false);

confirmOkButton.addEventListener('click', () => finish(true));
confirmCancelButton.addEventListener('click', cancelConfirm);
wireModalClose({ modal: confirmModal, closeButton: confirmCloseButton, onClose: cancelConfirm });

// Replaces window.confirm() with the app's own themed, translated,
// focus-trapped dialog. Resolves true/false once the user picks.
export function confirmDialog({ title, message, confirmLabel }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmOkButton.textContent = confirmLabel;
  openModal(confirmModal, cancelConfirm);
  return new Promise((resolve) => {
    resolvePending = resolve;
  });
}
