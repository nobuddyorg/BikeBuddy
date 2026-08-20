import { describe, it, expect } from 'vitest';
import { computeTourStats } from '../src/lib/stats.js';

const NOW = new Date('2026-08-20T00:00:00Z');

describe('computeTourStats', () => {
  it('returns zeroed stats for an empty list', () => {
    expect(computeTourStats([], NOW)).toEqual({
      totalDistance: 0,
      totalCount: 0,
      averageDistance: 0,
      distanceThisYear: 0,
      distanceLastYear: 0,
      longestTour: null,
      perYear: [],
    });
  });

  it('sums total distance and count', () => {
    const tours = [
      { id: 'a', distance: 20, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', distance: 30, createdAt: '2026-02-01T00:00:00Z' },
    ];
    const stats = computeTourStats(tours, NOW);
    expect(stats.totalDistance).toBe(50);
    expect(stats.totalCount).toBe(2);
    expect(stats.averageDistance).toBe(25);
  });

  it('splits distance into this year vs last year', () => {
    const tours = [
      { id: 'a', distance: 20, createdAt: '2026-01-01T00:00:00Z' }, // this year
      { id: 'b', distance: 30, createdAt: '2025-06-01T00:00:00Z' }, // last year
      { id: 'c', distance: 10, createdAt: '2024-06-01T00:00:00Z' }, // neither
    ];
    const stats = computeTourStats(tours, NOW);
    expect(stats.distanceThisYear).toBe(20);
    expect(stats.distanceLastYear).toBe(30);
  });

  it('finds the longest ride', () => {
    const tours = [
      { id: 'a', name: 'Short', distance: 10, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', name: 'Long', distance: 100, createdAt: '2026-02-01T00:00:00Z' },
      { id: 'c', name: 'Medium', distance: 50, createdAt: '2026-03-01T00:00:00Z' },
    ];
    expect(computeTourStats(tours, NOW).longestTour.id).toBe('b');
  });

  it('groups distance and count per year, newest first', () => {
    const tours = [
      { id: 'a', distance: 20, createdAt: '2024-01-01T00:00:00Z' },
      { id: 'b', distance: 30, createdAt: '2024-06-01T00:00:00Z' },
      { id: 'c', distance: 10, createdAt: '2026-01-01T00:00:00Z' },
    ];
    expect(computeTourStats(tours, NOW).perYear).toEqual([
      { year: 2026, distance: 10, count: 1 },
      { year: 2024, distance: 50, count: 2 },
    ]);
  });

  it('treats a missing distance as zero without breaking the average', () => {
    const tours = [
      { id: 'a', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', distance: 40, createdAt: '2026-01-02T00:00:00Z' },
    ];
    const stats = computeTourStats(tours, NOW);
    expect(stats.totalDistance).toBe(40);
    expect(stats.averageDistance).toBe(20);
  });

  it('excludes a tour with an unparsable date from the per-year breakdown', () => {
    const tours = [{ id: 'a', distance: 10, createdAt: 'not-a-date' }];
    const stats = computeTourStats(tours, NOW);
    expect(stats.perYear).toEqual([]);
    expect(stats.totalDistance).toBe(10); // still counted toward the total
  });
});
