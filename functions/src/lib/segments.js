// @ts-check
'use strict';

/**
 * @template T
 * @typedef {{ heatmapData: T[], segmentStarts: number[] }} SegmentedLine the points in one list,
 *   and the index where each segment after the first begins (#552)
 */

/**
 * @template T
 * @param {T[][]} segments
 * @returns {SegmentedLine<T>}
 */
function joinSegments(segments) {
  const segmentStarts = [];
  let start = 0;
  for (const segment of segments.slice(0, -1)) {
    start += segment.length;
    segmentStarts.push(start);
  }
  return { heatmapData: segments.flat(), segmentStarts };
}

/**
 * @template T
 * @param {SegmentedLine<T>} line
 * @returns {T[][]} at least one segment, empty for an empty line
 */
function splitSegments({ heatmapData, segmentStarts }) {
  const bounds = [0, ...segmentStarts, heatmapData.length];
  return bounds.slice(1).map((end, index) => heatmapData.slice(bounds[index], end));
}

module.exports = { joinSegments, splitSegments };
