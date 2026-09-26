// @ts-check

const threeAround = (cell) => Array.from({ length: 3 }, (_, offset) => cell - 1 + offset);

const neighbourKeys = (column, row) =>
  threeAround(column).flatMap((nearColumn) =>
    threeAround(row).map((nearRow) => `${nearColumn},${nearRow}`),
  );

// Members within thresholdPx sit in the same or an adjacent cell of a thresholdPx grid.
function firstGroupNear({ point, cells, cellOf, thresholdPx }) {
  const nearGroups = neighbourKeys(cellOf(point.x), cellOf(point.y))
    .filter((key) => cells.has(key))
    .flatMap((key) => cells.get(key))
    .filter((member) => Math.hypot(member.x - point.x, member.y - point.y) <= thresholdPx)
    .map((member) => member.groupIndex);
  return Math.min(...nearGroups);
}

// Single pass: a point joins the first group with a member within thresholdPx. A grid keeps it
// linear, so a zoom with thousands of photos does not compare every pin with every other.
export function groupByProximity(points, thresholdPx) {
  /** @type {(typeof points)[]} */
  const groups = [];
  const cells = new Map();
  const cellOf = (coordinate) => Math.floor(coordinate / thresholdPx);
  for (const point of points) {
    const found = firstGroupNear({ point, cells, cellOf, thresholdPx });
    const groupIndex = Number.isFinite(found) ? found : groups.push([]) - 1;
    groups[groupIndex].push(point);
    const key = `${cellOf(point.x)},${cellOf(point.y)}`;
    const member = { x: point.x, y: point.y, groupIndex };
    const cell = cells.get(key);
    if (cell) cell.push(member);
    else cells.set(key, [member]);
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
