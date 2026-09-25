// @ts-check
'use strict';

const { simplifyToTarget } = require('./simplify');

// Every tour's track is one heat layer in the browser; above this many points
// in total, each track is simplified to its proportional share.
const TOTAL_POINT_BUDGET = 100000;
const MIN_POINTS_PER_TOUR = 20;

// Below the heat layer's dot footprint at maximum zoom (frontend heatmapZoom.js),
// so a simplified straight stretch still reads as one trail.
const MAX_GAP_METERS = 50;

/** @returns {[number, number][][]} one track per tour, in order */
function budgetHeatmapData(tours, { totalPointBudget, maxGapMeters }) {
  const tracks = tours.map((tour) => tour.heatmapData ?? []);
  const totalPoints = tracks.reduce((sum, track) => sum + track.length, 0);
  if (totalPoints <= totalPointBudget) return tracks;

  return tracks.map((track) => {
    const targetCount = Math.max(
      MIN_POINTS_PER_TOUR,
      Math.round((totalPointBudget * track.length) / totalPoints),
    );
    return simplifyToTarget(track, { targetCount, maxGapMeters });
  });
}

module.exports = { budgetHeatmapData, TOTAL_POINT_BUDGET, MAX_GAP_METERS };
