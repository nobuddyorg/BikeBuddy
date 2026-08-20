'use strict';

// Pure aggregate-statistics computation over the full tour list — no DOM, no
// state.js — so it can be unit tested the same way as tours.js/format.js.

// `now` is injectable so "this year"/"last year" are testable without
// depending on the real clock.
export function computeTourStats(tours, now = new Date()) {
  if (tours.length === 0) {
    return {
      totalDistance: 0,
      totalCount: 0,
      averageDistance: 0,
      distanceThisYear: 0,
      distanceLastYear: 0,
      longestTour: null,
      perYear: [],
    };
  }

  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;

  let totalDistance = 0;
  let distanceThisYear = 0;
  let distanceLastYear = 0;
  let longestTour = tours[0];
  const byYear = new Map();

  for (const tour of tours) {
    const distance = tour.distance || 0;
    totalDistance += distance;
    if (distance > (longestTour.distance || 0)) longestTour = tour;

    const year = new Date(tour.createdAt).getFullYear();
    if (Number.isNaN(year)) continue; // no date to attribute this ride to a year

    if (year === thisYear) distanceThisYear += distance;
    if (year === lastYear) distanceLastYear += distance;

    const entry = byYear.get(year) || { year, distance: 0, count: 0 };
    entry.distance += distance;
    entry.count += 1;
    byYear.set(year, entry);
  }

  return {
    totalDistance,
    totalCount: tours.length,
    averageDistance: totalDistance / tours.length,
    distanceThisYear,
    distanceLastYear,
    longestTour,
    perYear: [...byYear.values()].sort((a, b) => b.year - a.year),
  };
}
