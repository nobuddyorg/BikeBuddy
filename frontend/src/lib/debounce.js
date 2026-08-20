'use strict';

// Trailing-edge debounce: fires once, delayMs after the last call, so a burst
// of calls (fast typing, a chain of moveend events) collapses into one.
export function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
