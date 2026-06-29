'use strict';

// Pure display formatters — shared by app.js and the unit tests.

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDistance(km) {
  if (typeof km !== 'number') return '—';
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function initials(nameOrEmail) {
  if (!nameOrEmail) return '?';
  const source = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}
