import { describe, it, expect } from 'vitest';
import { groupByProximity, fanOffsets } from '../src/lib/pinLayout.js';

describe('groupByProximity', () => {
  it('returns an empty array for no points', () => {
    expect(groupByProximity([], 24)).toEqual([]);
  });

  it('keeps far-apart points in separate groups', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 100 };
    expect(groupByProximity([a, b], 24)).toEqual([[a], [b]]);
  });

  it('groups points within the threshold', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(groupByProximity([a, b], 24)).toEqual([[a, b]]);
  });

  it('groups points exactly at the threshold, and measures vertical distance too', () => {
    const origin = { x: 0, y: 0 };
    const atThreshold = { x: 0, y: 24 };
    expect(groupByProximity([origin, atThreshold], 24)).toEqual([[origin, atThreshold]]);
    const above = { x: 0, y: -50 };
    const below = { x: 0, y: 50 };
    expect(groupByProximity([above, below], 24)).toEqual([[above], [below]]);
  });

  it('chains proximity transitively through a shared neighbor', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 20, y: 0 }; // within 24px of a
    const c = { x: 40, y: 0 }; // within 24px of b, not of a (distance 40)
    expect(groupByProximity([a, b, c], 24)).toEqual([[a, b, c]]);
  });
});

describe('groupByProximity across grid cells', () => {
  // A 24px grid: each neighbour of (30, 30) lies in a different adjacent cell.
  it.each([
    ['left', { x: 10, y: 30 }],
    ['right', { x: 50, y: 30 }],
    ['above', { x: 30, y: 10 }],
    ['below', { x: 30, y: 50 }],
    ['up-left', { x: 20, y: 20 }],
    ['down-right', { x: 40, y: 40 }],
    ['up-right', { x: 40, y: 20 }],
    ['down-left', { x: 20, y: 40 }],
  ])('groups a near point in the cell %s', (_direction, neighbour) => {
    const centre = { x: 30, y: 30 };
    expect(groupByProximity([centre, neighbour], 24)).toEqual([[centre, neighbour]]);
  });

  it('keeps a point two cells away apart, even on the same row', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 49, y: 0 };
    expect(groupByProximity([a, b], 24)).toEqual([[a], [b]]);
  });

  it('joins the first group formed when members of two groups are near', () => {
    const first = { x: 0, y: 0 };
    const second = { x: 40, y: 0 };
    const between = { x: 20, y: 0 };
    expect(groupByProximity([second, first, between], 24)).toEqual([[second, between], [first]]);
    expect(groupByProximity([first, second, between], 24)).toEqual([[first, between], [second]]);
  });

  it('matches the pairwise definition on a dense scatter', () => {
    const points = Array.from({ length: 200 }, (_, index) => ({
      x: (index * 37) % 311,
      y: (index * 53) % 197,
    }));
    const pairwise = [];
    for (const point of points) {
      const group = pairwise.find((candidate) =>
        candidate.some((member) => Math.hypot(member.x - point.x, member.y - point.y) <= 24),
      );
      if (group) group.push(point);
      else pairwise.push([point]);
    }

    expect(groupByProximity(points, 24)).toEqual(pairwise);
  });
});

describe('fanOffsets', () => {
  it('returns a single zero offset for n <= 1', () => {
    expect(fanOffsets(0, 16)).toEqual([[0, 0]]);
    expect(fanOffsets(1, 16)).toEqual([[0, 0]]);
  });

  it('returns n offsets each at the given radius from the origin', () => {
    const offsets = fanOffsets(4, 16);
    expect(offsets).toHaveLength(4);
    for (const [dx, dy] of offsets) {
      expect(Math.hypot(dx, dy)).toBeCloseTo(16, 5);
    }
  });

  it('spaces the offsets evenly around the circle', () => {
    // `|| 0` turns the -0 of a rounded tiny negative into 0.
    const rounded = fanOffsets(4, 10).map(([dx, dy]) => [Math.round(dx) || 0, Math.round(dy) || 0]);
    expect(rounded).toEqual([
      [10, 0],
      [0, 10],
      [-10, 0],
      [0, -10],
    ]);
  });

  it('spreads offsets to distinct positions', () => {
    const offsets = fanOffsets(3, 10);
    const unique = new Set(offsets.map(([dx, dy]) => `${dx.toFixed(3)},${dy.toFixed(3)}`));
    expect(unique.size).toBe(3);
  });
});
