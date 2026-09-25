import { describe, it, expect } from 'vitest';
import { hasNoPoints, routePointSets, selectionKey } from '../src/lib/routes.js';

describe('routePointSets', () => {
  it('keeps one point list per tour, empty when not loaded', () => {
    expect(routePointSets([{ heatmapData: [[1, 2]] }, {}])).toEqual([[[1, 2]], []]);
  });
});

describe('hasNoPoints', () => {
  it('is true only when every list is empty', () => {
    expect(hasNoPoints([[], []])).toBe(true);
    expect(hasNoPoints([[], [[1, 2]]])).toBe(false);
    expect(hasNoPoints([])).toBe(true);
  });
});

describe('selectionKey', () => {
  it('ignores the order ids were selected in', () => {
    expect(selectionKey(new Set(['b', 'a']))).toBe(selectionKey(['a', 'b']));
    expect(selectionKey(['b', 'a'])).toBe('a,b');
  });

  it('tells different selections apart', () => {
    expect(selectionKey(['a'])).not.toBe(selectionKey(['a', 'b']));
  });
});
