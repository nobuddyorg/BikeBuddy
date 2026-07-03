'use strict';

// Groups points whose pixel distance to some existing group member is
// <= thresholdPx. Single pass: each point joins the first group containing
// a member within threshold, else starts a new group. Good enough for the
// small number of geotagged photos typically visible in one viewport.
export function groupByProximity(points, thresholdPx) {
  const groups = [];
  for (const point of points) {
    const group = groups.find((g) =>
      g.some((p) => Math.hypot(p.x - point.x, p.y - point.y) <= thresholdPx),
    );
    if (group) group.push(point);
    else groups.push([point]);
  }
  return groups;
}

// Returns `n` [dx, dy] pixel offsets arranged evenly around a circle of the
// given radius. A single point needs no offset.
export function fanOffsets(n, radiusPx) {
  if (n <= 1) return [[0, 0]];
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return [radiusPx * Math.cos(angle), radiusPx * Math.sin(angle)];
  });
}
