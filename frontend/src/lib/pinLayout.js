// @ts-check

// Single pass: a point joins the first group with a member within thresholdPx.
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

// Evenly spaced on a circle of radiusPx; a single point needs no offset.
export function fanOffsets(count, radiusPx) {
  if (count <= 1) return [[0, 0]];
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return [radiusPx * Math.cos(angle), radiusPx * Math.sin(angle)];
  });
}
