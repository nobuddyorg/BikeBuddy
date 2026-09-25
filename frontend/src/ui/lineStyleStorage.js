import { parseLineStyle } from '../lib/lineStyle.js';

const STORAGE_KEY = 'bikebuddy-line-style';

export function loadLineStyle() {
  return parseLineStyle(localStorage.getItem(STORAGE_KEY));
}

export function saveLineStyle(style) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
}
