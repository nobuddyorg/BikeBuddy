import { describe, it, expect } from 'vitest';
import { formatDate, formatDistance, initials } from '../src/lib/format.js';

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
