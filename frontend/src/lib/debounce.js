// @ts-check

export function debounce(callback, delayMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delayMs);
  };
}
