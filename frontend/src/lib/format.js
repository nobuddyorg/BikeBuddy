'use strict';

export function formatDate(iso, locale = 'en-GB') {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDistance(km) {
  if (typeof km !== 'number') return '—';
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

// null (not 0) means "unknown", e.g. a GPX with no <ele> — kept distinct from
// an em dash's other use (empty string) so callers only need a typeof check.
export function formatElevation(m) {
  if (typeof m !== 'number') return '—';
  return `${Math.round(m)} m`;
}

export function formatDuration(seconds) {
  if (typeof seconds !== 'number') return '—';
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

export function formatSpeed(kmh) {
  if (typeof kmh !== 'number') return '—';
  return `${kmh.toFixed(1)} km/h`;
}

export function initials(nameOrEmail) {
  if (!nameOrEmail) return '?';
  const source = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}
