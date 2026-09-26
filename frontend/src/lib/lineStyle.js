// @ts-check

export const DEFAULT_LINE_STYLE = { color: '#d97a36', weight: 3, opacity: 0.75 };

export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 16;
export const OPACITY_MIN = 0.2;
export const OPACITY_MAX = 1;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStored(raw) {
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return {}; // corrupted JSON counts as nothing stored
  }
}

// A tampered or stale stored entry falls back to the defaults field by field.
export function parseLineStyle(raw) {
  const stored = readStored(raw);
  const color = HEX_COLOR.test(stored.color) ? stored.color : DEFAULT_LINE_STYLE.color;
  const weight = Number.isFinite(stored.weight)
    ? clamp(stored.weight, WEIGHT_MIN, WEIGHT_MAX)
    : DEFAULT_LINE_STYLE.weight;
  const opacity = Number.isFinite(stored.opacity)
    ? clamp(stored.opacity, OPACITY_MIN, OPACITY_MAX)
    : DEFAULT_LINE_STYLE.opacity;
  return { color, weight, opacity };
}

export function opacityToPercent(opacity) {
  return Math.round(opacity * 100);
}

export function percentToOpacity(percent) {
  return percent / 100;
}
