import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('ignores the case and padding of the query', () => {
    expect(matchScore('  BEACH ', 'Beach Ride')).toEqual(matchScore('beach', 'Beach Ride'));
  });

  it('scores a scatter by its spread, not by where it starts', () => {
    expect(score('ab', 'xxa1b')).toBe(score('ab', 'a1b'));
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

  it('sorts a tour without a name before any named one, whatever the input order', () => {
    const alps = { id: 'alps', name: 'Alps' };
    const zeta = { id: 'zeta', name: 'Zeta' };
    const unnamed = { id: 'unnamed' };
    for (const tours of [
      [zeta, unnamed, alps],
      [alps, zeta, unnamed],
      [unnamed, alps, zeta],
      [zeta, alps, unnamed],
    ]) {
      expect(visibleIds({ tours, sort: 'name-asc', search: '' })).toEqual([
        'unnamed',
        'alps',
        'zeta',
      ]);
      expect(visibleIds({ tours, sort: 'name-desc', search: '' })).toEqual([
        'zeta',
        'alps',
        'unnamed',
      ]);
    }
  });

  it('ranks every scatter wider than the ceiling alike, so the sort decides', () => {
    const widest = { id: 'widest', name: `a${'z'.repeat(398)}b` };
    const nearlyAsWide = { id: 'nearly', name: `a${'z'.repeat(397)}b` };
    const tours = [nearlyAsWide, widest];
    expect(visibleIds({ tours, sort: 'name-desc', search: 'ab' })).toEqual(['widest', 'nearly']);
    expect(visibleIds({ tours, sort: 'name-asc', search: 'ab' })).toEqual(['nearly', 'widest']);
  });

  it('never matches a tour with neither a name nor a description', () => {
    expect(visibleIds({ tours: [{ id: 'blank' }], sort: 'date-desc', search: 'here' })).toEqual([]);
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

  it('drops a tour just past any one edge, and keeps one on each edge', () => {
    const at = (lat, lon) => ({ id: `${lat},${lon}`, heatmapData: [[lat, lon]] });
    const outside = [at(39.9, 10), at(50.1, 10), at(45, 4.9), at(45, 15.1)];
    const onEdges = [at(40, 10), at(50, 10), at(45, 5), at(45, 15)];
    expect(toursInView(outside, BOUNDS)).toEqual([]);
    expect(toursInView(onEdges, BOUNDS)).toEqual(onEdges);
  });

  it('treats a tour with no heatmapData yet as out of view', () => {
    const t = { id: 'a' };
    expect(toursInView([t], BOUNDS)).toEqual([]);
  });
});

// The detail view shows the local date, so the editor must read and write the same one.
describe('withUpdatedDate', () => {
  it('replaces the date but keeps the original time-of-day', () => {
    expect(withUpdatedDate('2026-05-01T14:32:07.123Z', '2026-06-15', 'UTC')).toBe(
      '2026-06-15T14:32:07.123Z',
    );
  });

  it('handles a leap-day target date', () => {
    expect(withUpdatedDate('2026-01-01T00:00:00.000Z', '2028-02-29', 'UTC')).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });

  it('sets the local date west of UTC, keeping the local time of day', () => {
    // 17:30 on 1 May in Los Angeles is already 2 May in UTC.
    expect(withUpdatedDate('2026-05-02T00:30:00.000Z', '2026-05-10', 'America/Los_Angeles')).toBe(
      '2026-05-11T00:30:00.000Z',
    );
  });

  it('sets the local date east of UTC, keeping the local time of day', () => {
    // 08:00 on 2 May in Auckland is still 1 May in UTC.
    expect(withUpdatedDate('2026-05-01T20:00:00.000Z', '2026-05-10', 'Pacific/Auckland')).toBe(
      '2026-05-09T20:00:00.000Z',
    );
  });

  it('keeps the local time of day across a daylight-saving change', () => {
    // 10:00 PST in January is 10:00 PDT in July: one hour earlier in UTC.
    expect(withUpdatedDate('2026-01-15T18:00:00.000Z', '2026-07-15', 'America/Los_Angeles')).toBe(
      '2026-07-15T17:00:00.000Z',
    );
  });

  it("settles on the answer's own offset when the date moves across the transition", () => {
    // 06:00 PST on 1 March; on 8 March 06:00 is already PDT, one hour less from UTC.
    expect(withUpdatedDate('2026-03-01T14:00:00.000Z', '2026-03-08', 'America/Los_Angeles')).toBe(
      '2026-03-08T13:00:00.000Z',
    );
  });

  it('lands on the next valid hour for a time the spring-forward gap skips', () => {
    // 02:30 does not exist on 8 March 2026 in Los Angeles; the clock jumps from 02:00 to 03:00.
    expect(withUpdatedDate('2026-03-01T10:30:00.000Z', '2026-03-08', 'America/Los_Angeles')).toBe(
      '2026-03-08T10:30:00.000Z',
    );
  });

  it('round-trips the value the editor shows', () => {
    const createdAt = '2026-05-01T20:00:00.000Z';
    const shown = toDateInputValue(createdAt, 'Pacific/Auckland');
    expect(withUpdatedDate(createdAt, shown, 'Pacific/Auckland')).toBe(createdAt);
  });

  it("uses the browser's time zone when given none", () => {
    const createdAt = '2026-05-01T20:00:00.000Z';
    expect(withUpdatedDate(createdAt, toDateInputValue(createdAt))).toBe(createdAt);
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
  it('offers the sorts in menu order, each with an English label', () => {
    const english = JSON.parse(
      readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'),
    );
    expect(SORT_OPTIONS.map((option) => option.key)).toEqual([
      'date-desc',
      'date-asc',
      'name-asc',
      'name-desc',
      'length-desc',
      'length-asc',
    ]);
    for (const { labelKey } of SORT_OPTIONS) expect(english[labelKey]).toBeTruthy();
    expect(new Set(SORT_OPTIONS.map((option) => option.labelKey)).size).toBe(SORT_OPTIONS.length);
  });

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
  it('keeps the calendar date of an ISO timestamp in UTC', () => {
    expect(toDateInputValue('2026-05-01T23:30:00.000Z', 'UTC')).toBe('2026-05-01');
  });

  it('shows the local date west of UTC', () => {
    expect(toDateInputValue('2026-05-02T00:30:00.000Z', 'America/Los_Angeles')).toBe('2026-05-01');
  });

  it('shows the local date east of UTC, zero-padded', () => {
    expect(toDateInputValue('2026-01-08T20:00:00.000Z', 'Pacific/Auckland')).toBe('2026-01-09');
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
