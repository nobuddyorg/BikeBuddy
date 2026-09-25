import { describe, it, expect } from 'vitest';
import {
  fuzzyMatchIndices,
  matchScore,
  visibleTours,
  toursInView,
  paginate,
  withUpdatedDate,
  tourListView,
  matchRuns,
  toDateInputValue,
  buildTourPatch,
  removeToursById,
  deletionFailureMessage,
  SORT_OPTIONS,
  DEFAULT_SORT,
  PAGE_SIZE,
} from '../src/lib/tours.js';

const visibleIds = ({ tours, sort, search }) =>
  visibleTours({ tours, sort, search, locale: 'en-GB' }).map((tour) => tour.id);

const tours = [
  { id: 'a', name: 'Alps Tour', createdAt: '2026-01-01T00:00:00Z', distance: 120 },
  { id: 'b', name: 'Beach Ride', createdAt: '2026-03-01T00:00:00Z', distance: 30 },
  { id: 'c', name: 'City Loop', createdAt: '2026-02-01T00:00:00Z', distance: 75 },
];

describe('fuzzyMatchIndices', () => {
  it('returns the matched character positions for an in-order subsequence', () => {
    expect(fuzzyMatchIndices('alp', 'Alps Tour')).toEqual({ matched: true, indices: [0, 1, 2] });
    // A..T..(ou)R
    expect(fuzzyMatchIndices('atr', 'Alps Tour')).toEqual({ matched: true, indices: [0, 5, 8] });
  });

  it('reports no match, and nothing to highlight, when the query does not fully match', () => {
    const miss = { matched: false, indices: [] };
    expect(fuzzyMatchIndices('xyz', 'Alps Tour')).toEqual(miss);
    expect(fuzzyMatchIndices('rua', 'Alps Tour')).toEqual(miss);
    // A partial match (the "tour" of "tours") still highlights nothing.
    expect(fuzzyMatchIndices('tours', 'Alps Tour')).toEqual(miss);
  });

  it('matches an empty or whitespace query with no indices', () => {
    expect(fuzzyMatchIndices('', 'Alps Tour')).toEqual({ matched: true, indices: [] });
    expect(fuzzyMatchIndices('   ', 'Alps Tour')).toEqual({ matched: true, indices: [] });
  });

  it('matches case-insensitively but indexes into the original text', () => {
    expect(fuzzyMatchIndices('ALP', 'Alps Tour').indices).toEqual([0, 1, 2]);
  });

  it('treats a missing text as empty', () => {
    expect(fuzzyMatchIndices('a', undefined).matched).toBe(false);
  });
});

describe('matchScore', () => {
  const score = (query, text) => matchScore(query, text).score;

  it('scores an exact match highest, then prefix, then word-boundary, then a plain substring', () => {
    expect(score('beach ride', 'Beach Ride')).toBeGreaterThan(score('beach', 'Beach Ride'));
    expect(score('beach', 'Beach Ride')).toBeGreaterThan(score('ride', 'Beach Ride'));
    expect(score('ride', 'Beach Ride')).toBeGreaterThan(score('each', 'Beach Ride'));
  });

  it('counts a hyphen as a word boundary', () => {
    expect(score('loop', 'Lake-loop')).toBe(score('loop', 'Lake loop'));
    expect(score('loop', 'Lake-loop')).toBeGreaterThan(score('oop', 'Lake-loop'));
  });

  it('scores a contiguous substring above a scattered subsequence for a related query', () => {
    expect(score('ride', 'Beach Ride')).toBeGreaterThan(score('rde', 'Beach Ride'));
  });

  it('scores a tighter scattered match above a sprawling one', () => {
    expect(score('ab', 'a1b')).toBeGreaterThan(score('ab', 'a123b'));
  });

  it('never scores a scattered match below 1', () => {
    expect(score('ab', `a${'x'.repeat(500)}b`)).toBe(1);
  });

  it('reports no match when the query does not match at all', () => {
    expect(matchScore('xyz', 'Beach Ride').matched).toBe(false);
  });

  it('treats an empty query as a neutral match', () => {
    expect(matchScore('', 'Beach Ride')).toEqual({ matched: true, score: 0 });
  });
});

describe('visibleTours', () => {
  it('sorts by newest first by default (unknown sort falls back)', () => {
    const ids = visibleIds({ tours, sort: 'bogus', search: '' });
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('sorts by name and by distance', () => {
    expect(visibleIds({ tours, sort: 'name-asc', search: '' })).toEqual(['a', 'b', 'c']);
    expect(visibleIds({ tours, sort: 'length-desc', search: '' })).toEqual(['a', 'c', 'b']);
    expect(visibleIds({ tours, sort: 'length-asc', search: '' })).toEqual(['b', 'c', 'a']);
  });

  it('sorts oldest first', () => {
    expect(visibleIds({ tours, sort: 'date-asc', search: '' })).toEqual(['a', 'c', 'b']);
  });

  it('filters by the fuzzy search before sorting', () => {
    expect(visibleIds({ tours, sort: 'name-asc', search: 'beach' })).toEqual(['b']);
  });

  it('ranks a contiguous name match above a scattered one', () => {
    const named = [
      { id: 'p', name: 'Beach Ride', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'q', name: 'Roadside Deer', createdAt: '2026-01-02T00:00:00Z' },
    ];
    expect(visibleIds({ tours: named, sort: 'date-desc', search: 'ride' })).toEqual(['p', 'q']);
  });

  it('searches the description too, but ranks it below any name match', () => {
    const withDesc = [
      ...tours,
      {
        id: 'd',
        name: 'Forest Loop',
        createdAt: '2026-04-01T00:00:00Z',
        description: 'A ride along the beach',
      },
    ];
    expect(visibleIds({ tours: withDesc, sort: 'date-desc', search: 'beach' })).toEqual(['b', 'd']);
  });

  it('does not mutate the input array', () => {
    const copy = [...tours];
    visibleTours({ tours, sort: 'name-desc', search: '', locale: 'en-GB' });
    expect(tours).toEqual(copy);
  });

  it('sorts tours with a missing name, date or distance as empty/zero, without throwing', () => {
    const full = { id: 'full', name: 'Zeta', createdAt: '2026-01-01T00:00:00Z', distance: 10 };
    const bare = { id: 'bare' };
    // Both argument orders, so each side of every comparator meets a missing field.
    for (const sparse of [
      [full, bare],
      [bare, full],
    ]) {
      const order = (sort) => visibleIds({ tours: sparse, sort, search: undefined });
      expect(order('name-asc')).toEqual(['bare', 'full']);
      expect(order('name-desc')).toEqual(['full', 'bare']);
      expect(order('date-asc')).toEqual(['bare', 'full']);
      expect(order('date-desc')).toEqual(['full', 'bare']);
      expect(order('length-asc')).toEqual(['bare', 'full']);
      expect(order('length-desc')).toEqual(['full', 'bare']);
    }
  });

  it('searches a tour without a name by its description only', () => {
    const unnamed = [{ id: 'u', description: 'coastal ride', createdAt: '2026-01-01T00:00:00Z' }];
    expect(visibleIds({ tours: unnamed, sort: 'date-desc', search: 'coast' })).toEqual(['u']);
  });

  it('breaks a relevance tie with the chosen sort', () => {
    const twins = [
      { id: 'old', name: 'Loop', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'new', name: 'Loop', createdAt: '2026-02-01T00:00:00Z' },
    ];
    expect(visibleIds({ tours: twins, sort: 'date-desc', search: 'loop' })).toEqual(['new', 'old']);
    expect(visibleIds({ tours: twins, sort: 'date-asc', search: 'loop' })).toEqual(['old', 'new']);
  });

  it('orders names by the given locale', () => {
    const named = [
      { id: 'z', name: 'Zebra' },
      { id: 'a', name: 'Äpple' },
    ];
    expect(
      visibleTours({ tours: named, sort: 'name-asc', search: '', locale: 'de-DE' }).map(
        (tour) => tour.id,
      ),
    ).toEqual(['a', 'z']);
    expect(
      visibleTours({ tours: named, sort: 'name-asc', search: '', locale: 'sv-SE' }).map(
        (tour) => tour.id,
      ),
    ).toEqual(['z', 'a']);
  });

  it('falls back to the chosen sort when the query is cleared', () => {
    expect(visibleIds({ tours, sort: 'name-asc', search: '' })).toEqual(['a', 'b', 'c']);
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
    const result = paginate({ items, page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(20);
    expect(result.items[0].id).toBe('t1');
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it('returns the remainder on the last page', () => {
    const result = paginate({ items, page: 2, pageSize: 20 });
    expect(result.items).toHaveLength(5);
    expect(result.items[0].id).toBe('t21');
    expect(result.page).toBe(2);
  });

  it('clamps a page beyond totalPages to the last page', () => {
    const result = paginate({ items, page: 99, pageSize: 20 });
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(5);
  });

  it('clamps a page below 1 to page 1', () => {
    const result = paginate({ items, page: 0, pageSize: 20 });
    expect(result.page).toBe(1);
    expect(result.items[0].id).toBe('t1');
  });

  it('reports a single page for an empty list', () => {
    const result = paginate({ items: [], page: 1, pageSize: 20 });
    expect(result.items).toEqual([]);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
  });

  it('reports a single page when everything fits on one page', () => {
    const result = paginate({ items: items.slice(0, 10), page: 1, pageSize: 20 });
    expect(result.totalPages).toBe(1);
  });
});

describe('SORT_OPTIONS', () => {
  it('lists every sort once, newest first as the default', () => {
    const keys = SORT_OPTIONS.map((option) => option.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DEFAULT_SORT).toBe('date-desc');
    for (const key of keys) {
      expect(visibleIds({ tours, sort: key, search: '' })).toHaveLength(tours.length);
    }
  });
});

describe('tourListView', () => {
  const many = Array.from({ length: PAGE_SIZE + 3 }, (_, index) => ({
    id: `t${index}`,
    name: `Tour ${index}`,
    createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    heatmapData: index === 0 ? [[45, 10]] : [[0, 0]],
  }));
  const view = (overrides) =>
    tourListView({
      tours: many,
      sort: 'date-asc',
      search: '',
      locale: 'en-GB',
      page: 1,
      ...overrides,
    });

  it('pages the sorted list and reports it as unfiltered', () => {
    const result = view({});
    expect(result.items.map((tour) => tour.id)).toEqual(
      many.slice(0, PAGE_SIZE).map((tour) => tour.id),
    );
    expect(result).toMatchObject({
      page: 1,
      totalPages: 2,
      visibleCount: many.length,
      totalCount: many.length,
      filtered: false,
    });
  });

  it('clamps a stale page number', () => {
    expect(view({ page: 9 }).page).toBe(2);
  });

  it('counts a search as a filter', () => {
    const result = view({ search: 'Tour 12' });
    expect(result).toMatchObject({ visibleCount: 1, totalCount: many.length, filtered: true });
    expect(view({ search: '   ' }).filtered).toBe(false);
  });

  it('scopes to the map bounds when given, and counts that as a filter', () => {
    const result = view({ inViewBounds: { south: 40, west: 5, north: 50, east: 15 } });
    expect(result.items.map((tour) => tour.id)).toEqual(['t0']);
    expect(result).toMatchObject({ visibleCount: 1, totalCount: many.length, filtered: true });
  });
});

describe('matchRuns', () => {
  it('splits text into alternating matched and unmatched runs', () => {
    expect(matchRuns('Alps Tour', [0, 1, 5])).toEqual([
      { text: 'Al', matched: true },
      { text: 'ps ', matched: false },
      { text: 'T', matched: true },
      { text: 'our', matched: false },
    ]);
  });

  it('returns one unmatched run without indices, and nothing for empty text', () => {
    expect(matchRuns('Loop', [])).toEqual([{ text: 'Loop', matched: false }]);
    expect(matchRuns('', [])).toEqual([]);
  });
});

describe('toDateInputValue', () => {
  it('keeps the calendar date of an ISO timestamp', () => {
    expect(toDateInputValue('2026-05-01T23:30:00.000Z')).toBe('2026-05-01');
  });

  it('is empty without a date', () => {
    expect(toDateInputValue(undefined)).toBe('');
  });
});

describe('buildTourPatch', () => {
  it('trims the text fields and moves the date, keeping the time of day', () => {
    expect(
      buildTourPatch({
        name: '  Alps  ',
        description: ' A loop ',
        date: '2026-06-15',
        createdAt: '2026-05-01T14:32:07.123Z',
      }),
    ).toEqual({ name: 'Alps', description: 'A loop', createdAt: '2026-06-15T14:32:07.123Z' });
  });
});

describe('removeToursById', () => {
  it('keeps only the tours whose id is not listed', () => {
    expect(removeToursById(tours, ['a', 'c']).map((tour) => tour.id)).toEqual(['b']);
  });
});

describe('deletionFailureMessage', () => {
  it('reports a total failure', () => {
    expect(deletionFailureMessage({ succeededCount: 0, totalCount: 3 })).toEqual({
      key: 'toast.tourDeleteError',
      params: {},
    });
  });

  it('reports how many of the batch were deleted', () => {
    expect(deletionFailureMessage({ succeededCount: 2, totalCount: 3 })).toEqual({
      key: 'toast.toursDeletedPartial',
      params: { deleted: 2, count: 3 },
    });
  });
});
