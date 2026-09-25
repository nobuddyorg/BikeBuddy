import { initialFocusIndex } from '../lib/layout.js';
import { showElement, hideElement, isHidden } from './dom.js';
import { pushLayer } from './router.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

// document.body when nothing is waiting for focus to come back.
let modalReturnFocus = document.body;

// Desktop's body never scrolls anyway (see style.css), but mobile's does now
// that the list is a normal scrolling page — without this a modal's backdrop
// no longer stops the list behind it from scrolling too. Counted (not just a
// toggle) so one modal closing doesn't unlock scroll while another is still
// open; guarded on the modal's own hidden state so a stray double-close (the
// back-button layer left over after an explicit close, same as elsewhere in
// this app) can't decrement twice.
let openModalCount = 0;

// onHistoryClose lets a caller with extra close-time cleanup (the lightbox)
// run its real close function when Back pops this modal, instead of the
// plain hideElement(modal) closeModal() would otherwise do.
export function openModal(modal, onHistoryClose = () => closeModal(modal)) {
  modalReturnFocus = document.activeElement ?? document.body;
  if (isHidden(modal)) {
    openModalCount++;
    document.body.classList.add('modal-open');
  }
  showElement(modal);
  const focusables = modal.querySelectorAll(FOCUSABLE);
  (focusables[initialFocusIndex(focusables.length)] || modal).focus();
  pushLayer(onHistoryClose);
}

export function closeModal(modal) {
  if (!isHidden(modal)) {
    openModalCount = Math.max(0, openModalCount - 1);
    if (openModalCount === 0) document.body.classList.remove('modal-open');
  }
  hideElement(modal);
  modalReturnFocus.focus();
  modalReturnFocus = document.body;
}

export const currentOpenModal = () => document.querySelector('.modal-overlay:not(.hidden)');

export function trapFocus(event, modal) {
  if (event.key !== 'Tab') return;
  const focusables = [...modal.querySelectorAll(FOCUSABLE)].filter(
    (element) => element.offsetParent !== null,
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function wireModalClose({ modal, closeButton, onClose }) {
  closeButton.addEventListener('click', onClose);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) onClose();
  });
}

// onFiles always receives an array; single-file callers destructure the first.
export function wireDropzone({ zone, input, onFiles }) {
  input.addEventListener('change', () => {
    onFiles(Array.from(input.files));
    input.value = ''; // allow re-selecting the same file(s)
  });
  // The input is nested inside the zone, so its bubbled click would re-enter
  // this handler and the browser would block the dialog as programmatic.
  zone.addEventListener('click', (event) => {
    if (event.target !== input) input.click();
  });
  zone.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    input.click();
  });
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('dragover');
    onFiles(Array.from(event.dataTransfer.files));
  });
}
