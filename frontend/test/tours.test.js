import { describe, it, expect } from 'vitest';
import { fuzzyMatch, visibleTours } from '../src/lib/tours.js';

const tours = [
  { id: 'a', name: 'Alps Tour', createdAt: '2026-01-01T00:00:00Z', distance: 120 },
  { id: 'b', name: 'Beach Ride', createdAt: '2026-03-01T00:00:00Z', distance: 30 },
  { id: 'c', name: 'City Loop', createdAt: '2026-02-01T00:00:00Z', distance: 75 },
];

describe('fuzzyMatch', () => {
  it('matches an in-order subsequence, case-insensitively', () => {
    expect(fuzzyMatch('alp', 'Alps Tour')).toBe(true);
    expect(fuzzyMatch('atr', 'Alps Tour')).toBe(true); // A..T..(ou)R
  });

  it('rejects characters out of order or absent', () => {
    expect(fuzzyMatch('xyz', 'Alps Tour')).toBe(false);
    expect(fuzzyMatch('rua', 'Alps Tour')).toBe(false);
  });

  it('treats an empty query as a match', () => {
    expect(fuzzyMatch('', 'anything')).toBe(true);
    expect(fuzzyMatch('   ', 'anything')).toBe(true);
  });
});

describe('visibleTours', () => {
  it('sorts by newest first by default (unknown sort falls back)', () => {
    const ids = visibleTours(tours, 'bogus', '').map((t) => t.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('sorts by name and by distance', () => {
    expect(visibleTours(tours, 'name-asc', '').map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(visibleTours(tours, 'length-desc', '').map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });

  it('filters by the fuzzy search before sorting', () => {
    const res = visibleTours(tours, 'name-asc', 'beach');
    expect(res.map((t) => t.id)).toEqual(['b']);
  });

  it('does not mutate the input array', () => {
    const copy = [...tours];
    visibleTours(tours, 'name-desc', '');
    expect(tours).toEqual(copy);
  });
});
