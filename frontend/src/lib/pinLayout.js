// @ts-check

// Groups points whose pixel distance to some existing group member is
// <= thresholdPx. Single pass: each point joins the first group containing
// a member within threshold, else starts a new group. Good enough for the
// small number of geotagged photos typically visible in one viewport.
export function groupByProximity(points, thresholdPx) {
  const groups = [];
  for (const point of points) {
    const group = groups.find((candidate) =>
      candidate.some((member) => Math.hypot(member.x - point.x, member.y - point.y) <= thresholdPx),
    );
    if (group) group.push(point);
    else groups.push([point]);
  }
  return groups;
}

// Returns `count` [dx, dy] pixel offsets arranged evenly around a circle of the
// given radius. A single point needs no offset.
export function fanOffsets(count, radiusPx) {
  if (count <= 1) return [[0, 0]];
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return [radiusPx * Math.cos(angle), radiusPx * Math.sin(angle)];
  });
}
