// @ts-check

// One point set per tour, so tours never get joined by a spurious segment
// across the gap between them the way a single flattened list would.
export function routePointSets(tours) {
  return tours.map((tour) => tour.heatmapData || []);
}

export function hasNoPoints(pointSets) {
  return pointSets.every((points) => points.length === 0);
}

// Order-independent, so a selection can be compared before and after an await.
export function selectionKey(ids) {
  return [...ids].sort().join(',');
}
