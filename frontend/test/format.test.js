import { describe, it, expect } from 'vitest';
import {
  formatCount,
  formatDate,
  formatDistance,
  formatElevation,
  formatDuration,
  formatPercent,
  formatSpeed,
  initials,
} from '../src/lib/format.js';

const EN = 'en-GB';
const DE = 'de-DE';

describe('formatDate', () => {
  it('formats an ISO date as D MMM YYYY', () => {
    expect(formatDate('2026-03-09T10:00:00Z', EN)).toBe('9 Mar 2026');
  });

  it('follows the given locale', () => {
    expect(formatDate('2026-03-09T10:00:00Z', DE)).toBe('9. März 2026');
  });

  it('returns an em dash for empty input', () => {
    expect(formatDate('', EN)).toBe('—');
    expect(formatDate(null, EN)).toBe('—');
  });
});

describe('formatCount', () => {
  it('groups digits the way the locale does', () => {
    expect(formatCount(12345, EN)).toBe('12,345');
    expect(formatCount(12345, DE)).toBe('12.345');
  });
});

describe('formatPercent', () => {
  it('turns a fraction into the locale’s percentage', () => {
    expect(formatPercent(0.75, EN)).toBe('75%');
    expect(formatPercent(0.75, DE)).toBe('75\u00a0%');
  });
});

describe('formatDistance', () => {
  it('shows one decimal below 10 km', () => {
    expect(formatDistance(4.25, EN)).toBe('4.3 km');
    expect(formatDistance(9.94, EN)).toBe('9.9 km');
  });

  it('rounds to whole km at 10 km and above', () => {
    expect(formatDistance(10, EN)).toBe('10 km');
    expect(formatDistance(42.6, EN)).toBe('43 km');
  });

  it('uses the locale’s decimal and group separators', () => {
    expect(formatDistance(4.25, DE)).toBe('4,3 km');
    expect(formatDistance(12345, DE)).toBe('12.345 km');
  });

  it('returns an em dash for non-numbers', () => {
    expect(formatDistance(undefined, EN)).toBe('—');
    expect(formatDistance('5', EN)).toBe('—');
  });
});

describe('formatElevation', () => {
  it('rounds to the nearest metre', () => {
    expect(formatElevation(340.6, EN)).toBe('341 m');
  });

  it('groups thousands the way the locale does', () => {
    expect(formatElevation(1340.4, DE)).toBe('1.340 m');
  });

  it('returns an em dash for null (unknown, not zero)', () => {
    expect(formatElevation(null, EN)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats under an hour as minutes only', () => {
    expect(formatDuration(45 * 60, EN)).toBe('45m');
  });

  it('formats an hour or more as hours and minutes', () => {
    expect(formatDuration(2 * 3600 + 15 * 60, EN)).toBe('2h 15m');
  });

  it('uses the locale’s units', () => {
    expect(formatDuration(2 * 3600 + 15 * 60, 'fr-FR')).toBe('2h 15min');
  });

  it('rounds to the nearest minute', () => {
    expect(formatDuration(90, EN)).toBe('2m'); // 1.5 min rounds up
  });

  it('returns an em dash for null (unknown, not zero)', () => {
    expect(formatDuration(null, EN)).toBe('—');
  });
});

describe('formatSpeed', () => {
  it('shows one decimal place', () => {
    expect(formatSpeed(21.46, EN)).toBe('21.5 km/h');
    expect(formatSpeed(21, EN)).toBe('21.0 km/h');
  });

  it('uses the locale’s decimal separator', () => {
    expect(formatSpeed(21.46, DE)).toBe('21,5 km/h');
  });

  it('returns an em dash for null (unknown, not zero)', () => {
    expect(formatSpeed(null, EN)).toBe('—');
  });
});

describe('initials', () => {
  it('uses first + last word of a display name', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
  });

  it('uses the first letter for a single word', () => {
    expect(initials('Ada')).toBe('A');
  });

  it('falls back to the email local part', () => {
    expect(initials('ada.lovelace@example.com')).toBe('A');
  });

  it('returns ? when empty', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});
