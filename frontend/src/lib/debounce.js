// @ts-check

// Trailing-edge debounce: fires once, delayMs after the last call, so a burst
// of calls (fast typing, a chain of moveend events) collapses into one.
export function debounce(callback, delayMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delayMs);
  };
}
