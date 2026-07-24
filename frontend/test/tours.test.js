import { describe, it, expect } from 'vitest';
import {
  fuzzyMatch,
  fuzzyMatchIndices,
  visibleTours,
  toursInView,
  paginate,
  withUpdatedDate,
} from '../src/lib/tours.js';

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

describe('fuzzyMatchIndices', () => {
  it('returns the matched character positions for an in-order subsequence', () => {
    expect(fuzzyMatchIndices('alp', 'Alps Tour')).toEqual([0, 1, 2]);
    expect(fuzzyMatchIndices('atr', 'Alps Tour')).toEqual([0, 5, 8]); // A..T..(ou)R
  });

  it('returns null when the query does not fully match', () => {
    expect(fuzzyMatchIndices('xyz', 'Alps Tour')).toBeNull();
    expect(fuzzyMatchIndices('rua', 'Alps Tour')).toBeNull();
  });

  it('returns an empty array for an empty or whitespace query', () => {
    expect(fuzzyMatchIndices('', 'Alps Tour')).toEqual([]);
    expect(fuzzyMatchIndices('   ', 'Alps Tour')).toEqual([]);
  });

  it('matches case-insensitively but indexes into the original text', () => {
    expect(fuzzyMatchIndices('ALP', 'Alps Tour')).toEqual([0, 1, 2]);
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

describe('toursInView', () => {
  const BOUNDS = { south: 40, west: 5, north: 50, east: 15 };

  it('keeps a tour with any point inside the bounds', () => {
    const t = {
      id: 'a',
      heatmapData: [
        [0, 0],
        [45, 10],
      ],
    };
    expect(toursInView([t], BOUNDS)).toEqual([t]);
  });

  it('drops a tour whose every point is outside the bounds', () => {
    const t = {
      id: 'a',
      heatmapData: [
        [0, 0],
        [60, 20],
      ],
    };
    expect(toursInView([t], BOUNDS)).toEqual([]);
  });

  it('counts a point exactly on the edge as in view (even partially on screen)', () => {
    const t = { id: 'a', heatmapData: [[40, 15]] };
    expect(toursInView([t], BOUNDS)).toEqual([t]);
  });

  it('treats a tour with no heatmapData yet as out of view', () => {
    const t = { id: 'a' };
    expect(toursInView([t], BOUNDS)).toEqual([]);
  });

  it('returns all tours unchanged when bounds is not given', () => {
    const tours = [{ id: 'a', heatmapData: [[0, 0]] }];
    expect(toursInView(tours, null)).toBe(tours);
  });
});

describe('withUpdatedDate', () => {
  it('replaces the date but keeps the original time-of-day', () => {
    expect(withUpdatedDate('2026-05-01T14:32:07.123Z', '2026-06-15')).toBe(
      '2026-06-15T14:32:07.123Z',
    );
  });

  it('handles a leap-day target date', () => {
    expect(withUpdatedDate('2026-01-01T00:00:00.000Z', '2028-02-29')).toBe(
      '2028-02-29T00:00:00.000Z',
    );
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
