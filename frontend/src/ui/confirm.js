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

// Escape and Back cancel through this, so the pending promise always settles.
export const cancelConfirm = () => finish(false);

confirmOkButton.addEventListener('click', () => finish(true));
confirmCancelButton.addEventListener('click', cancelConfirm);
wireModalClose({ modal: confirmModal, closeButton: confirmCloseButton, onClose: cancelConfirm });

export function confirmDialog({ title, message, confirmLabel }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmOkButton.textContent = confirmLabel;
  openModal(confirmModal, cancelConfirm);
  return new Promise((resolve) => {
    resolvePending = resolve;
  });
}
