import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDistance,
  formatElevation,
  formatDuration,
  formatSpeed,
  initials,
} from '../src/lib/format.js';

describe('formatDate', () => {
  it('formats an ISO date as D MMM YYYY', () => {
    expect(formatDate('2026-03-09T10:00:00Z')).toBe('9 Mar 2026');
  });

  it('returns an em dash for empty input', () => {
    expect(formatDate('')).toBe('—');
    expect(formatDate(null)).toBe('—');
  });
});

describe('formatDistance', () => {
  it('shows one decimal below 10 km', () => {
    expect(formatDistance(4.25)).toBe('4.3 km');
  });

  it('rounds to whole km at 10 km and above', () => {
    expect(formatDistance(10)).toBe('10 km');
    expect(formatDistance(42.6)).toBe('43 km');
  });

  it('returns an em dash for non-numbers', () => {
    expect(formatDistance(undefined)).toBe('—');
    expect(formatDistance('5')).toBe('—');
  });
});

describe('formatElevation', () => {
  it('rounds to the nearest metre', () => {
    expect(formatElevation(340.6)).toBe('341 m');
  });

  it('returns an em dash for null (unknown, not zero)', () => {
    expect(formatElevation(null)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats under an hour as minutes only', () => {
    expect(formatDuration(45 * 60)).toBe('45m');
  });

  it('formats an hour or more as hours and minutes', () => {
    expect(formatDuration(2 * 3600 + 15 * 60)).toBe('2h 15m');
  });

  it('rounds to the nearest minute', () => {
    expect(formatDuration(90)).toBe('2m'); // 1.5 min rounds up
  });

  it('returns an em dash for null (unknown, not zero)', () => {
    expect(formatDuration(null)).toBe('—');
  });
});

describe('formatSpeed', () => {
  it('shows one decimal place', () => {
    expect(formatSpeed(21.46)).toBe('21.5 km/h');
  });

  it('returns an em dash for null (unknown, not zero)', () => {
    expect(formatSpeed(null)).toBe('—');
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
