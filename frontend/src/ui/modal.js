'use strict';

import { show } from './dom.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';
let modalReturnFocus = null;

export function openModal(modal) {
  modalReturnFocus = document.activeElement;
  show(modal, true);
  const focusables = modal.querySelectorAll(FOCUSABLE);
  (focusables[focusables.length > 1 ? 1 : 0] || modal).focus();
}

export function closeModal(modal) {
  show(modal, false);
  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  modalReturnFocus = null;
}

export const openModalEl = () => document.querySelector('.modal-overlay:not(.hidden)');

export function trapFocus(e, modal) {
  if (e.key !== 'Tab') return;
  const f = [...modal.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (f.length === 0) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function wireModalClose(modal, closeBtn, closeFn) {
  closeBtn.addEventListener('click', closeFn);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeFn();
  });
}

// onFiles always receives an array; single-file callers destructure the first.
export function wireDropzone(zone, input, onFiles) {
  input.addEventListener('change', () => {
    onFiles(Array.from(input.files));
    input.value = ''; // allow re-selecting the same file(s)
  });
  // The input is nested inside the zone, so its bubbled click would re-enter
  // this handler and the browser would block the dialog as programmatic.
  zone.addEventListener('click', (e) => {
    if (e.target !== input) input.click();
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    onFiles(Array.from(e.dataTransfer.files));
  });
}
