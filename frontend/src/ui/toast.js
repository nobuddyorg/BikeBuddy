'use strict';

import { elToasts } from './dom.js';

export function toast(message, type = 'info', ms = 4000) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  const remove = () => el.remove();
  el.addEventListener('click', remove);
  elToasts.appendChild(el);
  setTimeout(remove, ms);
}
