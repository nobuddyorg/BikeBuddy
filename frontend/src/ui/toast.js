import { toastContainer } from './dom.js';

const DEFAULT_DURATION_MS = 4000;

// `action` (optional): { label, onClick } renders a button that runs onClick
// and dismisses the toast, without triggering the toast's own click-to-dismiss.
export function toast(message, { type = 'info', durationMs = DEFAULT_DURATION_MS, action } = {}) {
  const toastElement = document.createElement('div');
  toastElement.className = `toast toast-${type}`;
  toastElement.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const remove = () => toastElement.remove();

  const text = document.createElement('span');
  text.textContent = message;
  toastElement.appendChild(text);
  if (action) toastElement.appendChild(actionButton({ action, onDone: remove }));

  toastElement.addEventListener('click', remove);
  toastContainer.appendChild(toastElement);
  setTimeout(remove, durationMs);
}

function actionButton({ action, onDone }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toast-action';
  button.textContent = action.label;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    action.onClick();
    onDone();
  });
  return button;
}
