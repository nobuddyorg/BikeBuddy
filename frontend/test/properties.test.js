import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { computeTourStats } from '../src/lib/stats.js';
import { formatDuration, formatDistance } from '../src/lib/format.js';
import { parseAppUrl, buildAppUrl } from '../src/lib/url.js';
import { visibleTours, paginate } from '../src/lib/tours.js';

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
        const stats = computeTourStats(list, new Date('2026-06-01T00:00:00Z'));
        const distanceOf = (entries) =>
          entries.reduce((sum, entry) => sum + (entry.distance || 0), 0);
        expect(stats.totalCount).toBe(list.length);
        expect(stats.totalDistance).toBeCloseTo(distanceOf(list), 6);
        const perYearDistance = distanceOf(stats.perYear);
        const perYearCount = stats.perYear.reduce((sum, year) => sum + year.count, 0);
        const dated = list.filter((tour) => tour.createdAt);
        expect(perYearCount).toBe(dated.length);
        expect(perYearDistance).toBeCloseTo(distanceOf(dated), 6);
        expect(stats.distanceThisYear + stats.distanceLastYear).toBeLessThanOrEqual(
          perYearDistance + 1e-6,
        );
      }),
    );
  });

  it('the longest tour is at least as long as every other', () => {
    fc.assert(
      fc.property(tours, (list) => {
        fc.pre(list.length > 0);
        const { longestTour } = computeTourStats(list, new Date('2026-06-01T00:00:00Z'));
        for (const tour of list)
          expect(longestTour.distance || 0).toBeGreaterThanOrEqual(tour.distance || 0);
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
        const [, hours = '0', minutes] = match;
        expect(Number(minutes)).toBeLessThan(60);
        expect(Number(hours) * 60 + Number(minutes)).toBe(Math.round(seconds / 60));
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
    tourId: fc.option(fc.string({ minLength: 1 }), { nil: '' }),
    sort: fc.constantFrom('', 'date-asc', 'name-asc', 'name-desc', 'length-desc', 'length-asc'),
    search: fc.option(fc.string({ minLength: 1 }), { nil: '' }),
    inView: fc.boolean(),
  });

  it('buildAppUrl -> parseAppUrl round-trips every state', () => {
    fc.assert(
      fc.property(state, (urlState) => {
        const url = new URL(buildAppUrl(urlState, '/BikeBuddy/'), 'https://nobuddy.org');
        expect(url.pathname).toBe('/BikeBuddy/');
        expect(parseAppUrl(url.search, url.hash)).toEqual(urlState);
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
          const first = paginate({ items, page: 1, pageSize: size });
          const seen = [];
          for (let page = 1; page <= first.totalPages; page++) {
            const pageItems = paginate({ items, page, pageSize: size }).items;
            expect(pageItems.length).toBeLessThanOrEqual(size);
            seen.push(...pageItems);
          }
          expect(seen).toEqual(items);
        },
      ),
    );
  });
});
