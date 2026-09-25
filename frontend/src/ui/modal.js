import { initialFocusIndex } from '../lib/layout.js';
import { showElement, hideElement } from './dom.js';
import { pushLayer, releaseLayer } from './router.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

// Topmost last: Escape and the focus trap act on the dialog on top, and each level returns focus
// to its own opener and takes back its own history entry.
const openModals = [];

// onHistoryClose runs when Back pops this modal, for callers with their own close cleanup.
export function openModal(modal, onHistoryClose = () => closeModal(modal)) {
  if (openModals.some((entry) => entry.modal === modal)) return;
  openModals.push({ modal, returnFocus: document.activeElement ?? document.body, onHistoryClose });
  document.body.classList.add('modal-open');
  showElement(modal);
  const focusables = modal.querySelectorAll(FOCUSABLE);
  (focusables[initialFocusIndex(focusables.length)] || modal).focus();
  pushLayer(onHistoryClose);
}

export function closeModal(modal) {
  hideElement(modal);
  const index = openModals.findIndex((entry) => entry.modal === modal);
  if (index === -1) return;
  const [entry] = openModals.splice(index, 1);
  if (openModals.length === 0) document.body.classList.remove('modal-open');
  entry.returnFocus.focus();
  releaseLayer(entry.onHistoryClose);
}

export const currentOpenModal = () => openModals.at(-1)?.modal ?? null;

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

export function wireDropzone({ zone, input, onFiles }) {
  input.addEventListener('change', () => {
    onFiles(Array.from(input.files));
    input.value = ''; // lets the same file be chosen again
  });
  // The input's own click bubbles here; re-clicking it would be blocked as programmatic.
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
