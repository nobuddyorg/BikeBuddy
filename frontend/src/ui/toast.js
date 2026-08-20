'use strict';

import { elToasts } from './dom.js';

// `action` (optional): { label, onClick } renders a button that runs onClick
// and dismisses the toast, without triggering the toast's own click-to-dismiss.
export function toast(message, type = 'info', ms = 4000, action) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const remove = () => el.remove();

  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      action.onClick();
      remove();
    });
    el.appendChild(btn);
  }

  el.addEventListener('click', remove);
  elToasts.appendChild(el);
  setTimeout(remove, ms);
}
