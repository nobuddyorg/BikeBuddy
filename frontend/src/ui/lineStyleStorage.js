import { parseLineStyle } from '../lib/lineStyle.js';

const STORAGE_KEY = 'bikebuddy-line-style';

// Storage can be blocked (privacy settings, a sandboxed frame): the style then lasts one visit.
export function loadLineStyle() {
  try {
    return parseLineStyle(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseLineStyle(null);
  }
}

export function saveLineStyle(style) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
  } catch {
    // Kept for this visit only.
  }
}
