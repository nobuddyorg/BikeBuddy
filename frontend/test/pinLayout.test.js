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
