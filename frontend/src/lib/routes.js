// @ts-check

// One set per GPX segment of each tour, so neither two tours nor two rides of one are joined by a
// line that was never ridden (#552).
export function routePointSets(tours) {
  return tours.flatMap((tour) => segmentsOf(tour.heatmapData || [], tour.segmentStarts || []));
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
