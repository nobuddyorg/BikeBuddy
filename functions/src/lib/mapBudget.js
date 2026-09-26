// @ts-check
'use strict';

const { simplifyToTarget } = require('./simplify');
const { joinSegments, splitSegments } = require('./segments');

// A hard cap on the points /api/map returns, whatever the rider's history.
const TOTAL_POINT_BUDGET = 100000;
// Enough for a short ride to keep its shape next to long ones.
const MIN_POINTS_PER_TOUR = 20;

/**
 * Each track with points keeps a floor, and the rest of the budget is shared by point count, so the
 * total stays within the budget (above 50,000 tracks the two-point floor alone would exceed it).
 *
 * @returns {[number, number][][]} one track per tour, in order
 */
function budgetTracks(tours, { totalPointBudget }) {
  const tracks = tours.map((tour) => tour.heatmapData ?? []);
  const totalPoints = tracks.reduce((sum, track) => sum + track.length, 0);
  if (totalPoints <= totalPointBudget) return tracks;

  const tracksWithPoints = tracks.filter((track) => track.length > 0).length;
  const floor = Math.max(
    2,
    Math.min(MIN_POINTS_PER_TOUR, Math.floor(totalPointBudget / tracksWithPoints)),
  );
  const shared = Math.max(0, totalPointBudget - floor * tracksWithPoints);
  return tracks.map((track) =>
    simplifyToTarget(track, {
      targetCount: floor + Math.floor((shared * track.length) / totalPoints),
    }),
  );
}

/**
 * budgetTracks over every segment of every track, so a break between two segments stays a break
 * (#552): each segment keeps its own ends and floor.
 *
 * @param {{ heatmapData: [number, number][], segmentStarts: number[] }[]} tracks
 * @returns {{ heatmapData: [number, number][], segmentStarts: number[] }[]} one per track, in order
 */
function budgetSegmentedTracks(tracks, budget) {
  const segmentsPerTrack = tracks.map(splitSegments);
  const budgeted = budgetTracks(
    segmentsPerTrack.flat().map((heatmapData) => ({ heatmapData })),
    budget,
  );
  let next = 0;
  return segmentsPerTrack.map((segments) => {
    next += segments.length;
    return joinSegments(budgeted.slice(next - segments.length, next));
  });
}

module.exports = { budgetTracks, budgetSegmentedTracks, TOTAL_POINT_BUDGET };
