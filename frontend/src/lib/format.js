// @ts-check

const UNKNOWN = '—';
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
// Below this, a distance keeps one decimal; a short ride's tenths matter.
const WHOLE_KILOMETRES_FROM = 10;

/** @param {{ locale: string, unit: string, fractionDigits: number, unitDisplay?: 'short' | 'narrow' }} options */
function unitFormat({ locale, unit, fractionDigits, unitDisplay = 'short' }) {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatDate(iso, locale) {
  if (!iso) return UNKNOWN;
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatCount(count, locale) {
  return new Intl.NumberFormat(locale).format(count);
}

export function formatPercent(fraction, locale) {
  return new Intl.NumberFormat(locale, { style: 'percent' }).format(fraction);
}

export function formatDistance(kilometres, locale) {
  if (typeof kilometres !== 'number') return UNKNOWN;
  const fractionDigits = kilometres < WHOLE_KILOMETRES_FROM ? 1 : 0;
  return unitFormat({ locale, unit: 'kilometer', fractionDigits }).format(kilometres);
}

// Not a number (e.g. a GPX with no <ele>) means unknown, which is not zero.
export function formatElevation(metres, locale) {
  if (typeof metres !== 'number') return UNKNOWN;
  return unitFormat({ locale, unit: 'meter', fractionDigits: 0 }).format(metres);
}

export function formatDuration(seconds, locale) {
  if (typeof seconds !== 'number') return UNKNOWN;
  const totalMinutes = Math.round(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  const format = (unit, value) =>
    unitFormat({ locale, unit, fractionDigits: 0, unitDisplay: 'narrow' }).format(value);
  const parts =
    hours === 0 ? [format('minute', minutes)] : [format('hour', hours), format('minute', minutes)];
  return new Intl.ListFormat(locale, { type: 'unit', style: 'narrow' }).format(parts);
}

export function formatSpeed(kilometresPerHour, locale) {
  if (typeof kilometresPerHour !== 'number') return UNKNOWN;
  return unitFormat({ locale, unit: 'kilometer-per-hour', fractionDigits: 1 }).format(
    kilometresPerHour,
  );
}

export function initials(nameOrEmail) {
  const words = (nameOrEmail || '').split('@')[0].split(/\s/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}
