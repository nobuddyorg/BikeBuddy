'use strict';

import { openModal, closeModal, wireModalClose } from './modal.js';
import {
  elConfirmModal,
  elConfirmTitle,
  elConfirmMessage,
  elBtnConfirmOk,
  elBtnConfirmCancel,
  elBtnCloseConfirm,
} from './dom.js';

let resolvePending = null;

function finish(result) {
  closeModal(elConfirmModal);
  const resolve = resolvePending;
  resolvePending = null;
  if (resolve) resolve(result);
}

// Exported so app.js's global Escape/Back handling can cancel like any other
// close, instead of leaving a promise unresolved.
export const cancelConfirm = () => finish(false);

elBtnConfirmOk.addEventListener('click', () => finish(true));
elBtnConfirmCancel.addEventListener('click', cancelConfirm);
wireModalClose(elConfirmModal, elBtnCloseConfirm, cancelConfirm);

// Replaces window.confirm() with the app's own themed, translated,
// focus-trapped dialog. Resolves true/false once the user picks.
export function confirmDialog({ title, message, confirmLabel }) {
  elConfirmTitle.textContent = title;
  elConfirmMessage.textContent = message;
  elBtnConfirmOk.textContent = confirmLabel;
  openModal(elConfirmModal, cancelConfirm);
  return new Promise((resolve) => {
    resolvePending = resolve;
  });
}
