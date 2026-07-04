import { describe, it, expect } from 'vitest';
import { fuzzyMatch, visibleTours, paginate } from '../src/lib/tours.js';

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

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: `t${i + 1}` }));

  it('returns the first page by default page size', () => {
    const result = paginate(items, 1, 20);
    expect(result.items).toHaveLength(20);
    expect(result.items[0].id).toBe('t1');
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it('returns the remainder on the last page', () => {
    const result = paginate(items, 2, 20);
    expect(result.items).toHaveLength(5);
    expect(result.items[0].id).toBe('t21');
    expect(result.page).toBe(2);
  });

  it('clamps a page beyond totalPages to the last page', () => {
    const result = paginate(items, 99, 20);
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(5);
  });

  it('clamps a page below 1 to page 1', () => {
    const result = paginate(items, 0, 20);
    expect(result.page).toBe(1);
    expect(result.items[0].id).toBe('t1');
  });

  it('reports a single page for an empty list', () => {
    const result = paginate([], 1, 20);
    expect(result.items).toEqual([]);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
  });

  it('reports a single page when everything fits on one page', () => {
    const result = paginate(items.slice(0, 10), 1, 20);
    expect(result.totalPages).toBe(1);
  });
});
