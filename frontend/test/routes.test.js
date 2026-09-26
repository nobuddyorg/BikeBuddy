import { describe, it, expect } from 'vitest';
import { hasNoPoints, routePointSets, segmentsOf, selectionKey } from '../src/lib/routes.js';

describe('routePointSets', () => {
  it('keeps one point list per tour, empty when not loaded', () => {
    expect(routePointSets([{ heatmapData: [[1, 2]] }, {}])).toEqual([[[1, 2]], []]);
  });

  it('keeps one point list per segment, so two rides of one tour are never joined (#552)', () => {
    const tour = {
      heatmapData: [
        [1, 1],
        [1, 2],
        [5, 5],
        [5, 6],
      ],
      segmentStarts: [2],
    };

    expect(routePointSets([tour, { heatmapData: [[9, 9]] }])).toEqual([
      [
        [1, 1],
        [1, 2],
      ],
      [
        [5, 5],
        [5, 6],
      ],
      [[9, 9]],
    ]);
  });
});

describe('segmentsOf', () => {
  it('cuts the points at each segment start', () => {
    expect(segmentsOf(['a', 'b', 'c', 'd'], [1, 3])).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('answers one list without starts, and one empty list for no points', () => {
    expect(segmentsOf(['a', 'b'], [])).toEqual([['a', 'b']]);
    expect(segmentsOf([], [])).toEqual([[]]);
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
