import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { computeTourStats } from '../src/lib/stats.js';
import { formatDuration, formatDistance } from '../src/lib/format.js';
import { parseAppUrl, buildAppUrl } from '../src/lib/url.js';
import { visibleTours, paginate } from '../src/lib/tours.js';

// Property tests for the pure frontend modules whose input space is too large
// for examples (design-decisions.md, "Property tests").

const tour = fc.record({
  id: fc.uuid(),
  name: fc.option(fc.string(), { nil: undefined }),
  distance: fc.option(fc.double({ min: 0, max: 5000, noNaN: true }), { nil: undefined }),
  createdAt: fc.option(
    fc
      .date({ min: new Date('2000-01-01'), max: new Date('2040-01-01'), noInvalidDate: true })
      .map((d) => d.toISOString()),
    { nil: undefined },
  ),
});
const tours = fc.array(tour, { maxLength: 60 });

describe('computeTourStats (properties)', () => {
  it('totals are the sums of their parts', () => {
    fc.assert(
      fc.property(tours, (list) => {
        const s = computeTourStats(list, new Date('2026-06-01T00:00:00Z'));
        const sum = list.reduce((acc, t) => acc + (t.distance || 0), 0);
        expect(s.totalCount).toBe(list.length);
        expect(s.totalDistance).toBeCloseTo(sum, 6);
        const perYearDistance = s.perYear.reduce((acc, y) => acc + y.distance, 0);
        const perYearCount = s.perYear.reduce((acc, y) => acc + y.count, 0);
        const dated = list.filter((t) => t.createdAt);
        expect(perYearCount).toBe(dated.length);
        expect(perYearDistance).toBeCloseTo(
          dated.reduce((acc, t) => acc + (t.distance || 0), 0),
          6,
        );
        expect(s.distanceThisYear + s.distanceLastYear).toBeLessThanOrEqual(perYearDistance + 1e-6);
      }),
    );
  });

  it('the longest tour is at least as long as every other', () => {
    fc.assert(
      fc.property(tours, (list) => {
        fc.pre(list.length > 0);
        const { longestTour } = computeTourStats(list, new Date('2026-06-01T00:00:00Z'));
        for (const t of list)
          expect(longestTour.distance || 0).toBeGreaterThanOrEqual(t.distance || 0);
      }),
    );
  });
});

describe('format (properties)', () => {
  it('formatDuration rounds to minutes and splits them into hours and minutes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 * 24 * 3600 }), (seconds) => {
        const text = formatDuration(seconds, 'en-GB');
        const match = /^(?:(\d+)h )?(\d+)m$/.exec(text);
        expect(match).not.toBeNull();
        const [, h = '0', m] = match;
        expect(Number(m)).toBeLessThan(60);
        expect(Number(h) * 60 + Number(m)).toBe(Math.round(seconds / 60));
      }),
    );
  });

  it('formatDistance parses back to within its rounding', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100_000, noNaN: true }), (km) => {
        // en-GB groups thousands with commas; strip them to read the number back.
        const shown = Number.parseFloat(formatDistance(km, 'en-GB').replaceAll(',', ''));
        expect(Math.abs(shown - km)).toBeLessThanOrEqual(km < 10 ? 0.05 + 1e-9 : 0.5 + 1e-9);
      }),
    );
  });
});

describe('URL state (properties)', () => {
  const state = fc.record({
    tourId: fc.option(fc.string({ minLength: 1 }), { nil: null }),
    sort: fc.constantFrom(null, 'date-asc', 'name-asc', 'name-desc', 'length-desc', 'length-asc'),
    search: fc.option(fc.string({ minLength: 1 }), { nil: null }),
    inView: fc.boolean(),
  });

  it('buildAppUrl -> parseAppUrl round-trips every state', () => {
    fc.assert(
      fc.property(state, (s) => {
        const url = new URL(buildAppUrl(s, '/BikeBuddy/'), 'https://nobuddy.org');
        expect(url.pathname).toBe('/BikeBuddy/');
        expect(parseAppUrl(url.search, url.hash)).toEqual(s);
      }),
    );
  });
});

describe('tour list (properties)', () => {
  const sortKey = fc.constantFrom(
    'date-desc',
    'date-asc',
    'name-asc',
    'name-desc',
    'length-desc',
    'length-asc',
  );

  it('sorting without a query is a permutation of the input', () => {
    fc.assert(
      fc.property(tours, sortKey, (list, sort) => {
        const out = visibleTours({ tours: list, sort, search: '', locale: 'en-GB' });
        expect(out).toHaveLength(list.length);
        expect(new Set(out)).toEqual(new Set(list));
      }),
    );
  });

  it('pages cover every item exactly once, each page within its size', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (items, size) => {
          const first = paginate(items, 1, size);
          const seen = [];
          for (let page = 1; page <= first.totalPages; page++) {
            const p = paginate(items, page, size);
            expect(p.items.length).toBeLessThanOrEqual(size);
            seen.push(...p.items);
          }
          expect(seen).toEqual(items);
        },
      ),
    );
  });
});
