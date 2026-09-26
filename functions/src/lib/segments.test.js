'use strict';

const { joinSegments, splitSegments } = require('./segments');

describe('joinSegments', () => {
  it('lists the points in order and marks where each later segment begins', () => {
    expect(joinSegments([['a', 'b'], ['c'], ['d', 'e', 'f']])).toStrictEqual({
      heatmapData: ['a', 'b', 'c', 'd', 'e', 'f'],
      segmentStarts: [2, 3],
    });
  });

  it('marks nothing for a single segment or none', () => {
    expect(joinSegments([['a', 'b']])).toStrictEqual({
      heatmapData: ['a', 'b'],
      segmentStarts: [],
    });
    expect(joinSegments([])).toStrictEqual({ heatmapData: [], segmentStarts: [] });
  });
});

describe('splitSegments', () => {
  it('cuts the points at each segment start', () => {
    expect(
      splitSegments({ heatmapData: ['a', 'b', 'c', 'd', 'e', 'f'], segmentStarts: [2, 3] }),
    ).toEqual([['a', 'b'], ['c'], ['d', 'e', 'f']]);
  });

  it('answers one segment for a line without starts, and one empty one for no points', () => {
    expect(splitSegments({ heatmapData: ['a', 'b'], segmentStarts: [] })).toEqual([['a', 'b']]);
    expect(splitSegments({ heatmapData: [], segmentStarts: [] })).toEqual([[]]);
  });

  it('undoes joinSegments', () => {
    const segments = [[1], [2, 3], [4, 5, 6]];
    expect(splitSegments(joinSegments(segments))).toEqual(segments);
  });
});
