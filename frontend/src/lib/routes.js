// @ts-check

// One set per GPX segment of each tour, so neither two tours nor two rides of one are joined by a
// line that was never ridden (#552).
export function routePointSets(tours) {
  return tours.flatMap(segmentsOfTour);
}

// Per track array, so each render hands the map the same sets and it keeps their lines (#580); a
// refetch assigns a new array.
const segmentsByTrack = new WeakMap();

function segmentsOfTour(tour) {
  const points = tour.heatmapData || [];
  if (!segmentsByTrack.has(points)) {
    segmentsByTrack.set(points, segmentsOf(points, tour.segmentStarts || []));
  }
  return segmentsByTrack.get(points);
}

// A line without segment starts (older tours, or a single segment) is one set.
export function segmentsOf(points, segmentStarts) {
  const bounds = [0, ...segmentStarts, points.length];
  return bounds.slice(1).map((end, index) => points.slice(bounds[index], end));
}

export function hasNoPoints(pointSets) {
  return pointSets.every((points) => points.length === 0);
}

// Order-independent, so a selection can be compared across an await.
export function selectionKey(ids) {
  return [...ids].sort().join(',');
}
