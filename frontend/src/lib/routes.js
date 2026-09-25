// @ts-check

// One set per tour, so separate tours are never joined by a spurious segment.
export function routePointSets(tours) {
  return tours.map((tour) => tour.heatmapData || []);
}

export function hasNoPoints(pointSets) {
  return pointSets.every((points) => points.length === 0);
}

// Order-independent, so a selection can be compared across an await.
export function selectionKey(ids) {
  return [...ids].sort().join(',');
}
