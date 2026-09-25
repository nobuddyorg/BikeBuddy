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

// Merges a stored value onto the default, discarding anything malformed
// (corrupted JSON, wrong types, out-of-range numbers) rather than letting a
// tampered or stale localStorage entry break rendering.
export function parseLineStyle(raw) {
  if (!raw) return { ...DEFAULT_LINE_STYLE };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_LINE_STYLE };
  }
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_LINE_STYLE };

  const color =
    typeof parsed.color === 'string' && HEX_COLOR.test(parsed.color)
      ? parsed.color
      : DEFAULT_LINE_STYLE.color;
  const weight = Number.isFinite(parsed.weight)
    ? clamp(parsed.weight, WEIGHT_MIN, WEIGHT_MAX)
    : DEFAULT_LINE_STYLE.weight;
  const opacity = Number.isFinite(parsed.opacity)
    ? clamp(parsed.opacity, OPACITY_MIN, OPACITY_MAX)
    : DEFAULT_LINE_STYLE.opacity;

  return { color, weight, opacity };
}

// The opacity slider works in whole percent.
export function opacityToPercent(opacity) {
  return Math.round(opacity * 100);
}

export function percentToOpacity(percent) {
  return percent / 100;
}
