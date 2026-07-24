'use strict';

// Pure tour list logic — sorting and the fuzzy search used by the tour list.

const tourTime = (t) => new Date(t.createdAt).getTime() || 0;

export const SORTERS = {
  'date-desc': (a, b) => tourTime(b) - tourTime(a),
  'date-asc': (a, b) => tourTime(a) - tourTime(b),
  'name-asc': (a, b) => (a.name || '').localeCompare(b.name || ''),
  'name-desc': (a, b) => (b.name || '').localeCompare(a.name || ''),
  'length-desc': (a, b) => (b.distance || 0) - (a.distance || 0),
  'length-asc': (a, b) => (a.distance || 0) - (b.distance || 0),
};

// Subsequence match: every char of the query appears in order within the text.
// Returns the matched indices into `text` (empty array for an empty query),
// or null if the query does not fully match.
export function fuzzyMatchIndices(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const t = (text || '').toLowerCase();
  const indices = [];
  let i = 0;
  for (let pos = 0; pos < t.length && i < q.length; pos++) {
    if (t[pos] === q[i]) {
      indices.push(pos);
      i++;
    }
  }
  return i === q.length ? indices : null;
}

export function fuzzyMatch(query, text) {
  return fuzzyMatchIndices(query, text) !== null;
}

// Tours filtered by the search box and ordered by the chosen sort.
export function visibleTours(tours, sort, search) {
  const sorter = SORTERS[sort] || SORTERS['date-desc'];
  return tours.filter((t) => fuzzyMatch(search, t.name)).sort(sorter);
}

// Tours whose recorded track has at least one point inside the given map
// bounds — "in view" means even partially on screen, not fully contained.
// bounds is a plain {south, west, north, east} object (see mapBoundsPlain in
// app.js) rather than a Leaflet LatLngBounds, so this stays framework-free.
// A tour whose heatmapData hasn't been fetched yet (see ensureDetail) has no
// points to test and is treated as out of view.
export function toursInView(tours, bounds) {
  if (!bounds) return tours;
  const { south, west, north, east } = bounds;
  return tours.filter((t) =>
    (t.heatmapData || []).some(
      ([lat, lon]) => lat >= south && lat <= north && lon >= west && lon <= east,
    ),
  );
}

// Combines a 'YYYY-MM-DD' input (from a <input type=date>) with the
// time-of-day of an existing ISO timestamp, so correcting a tour's date
// doesn't clobber the time it was recorded at.
export function withUpdatedDate(originalIso, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const combined = new Date(originalIso);
  combined.setUTCFullYear(y, m - 1, d);
  return combined.toISOString();
}

export const PAGE_SIZE = 10;

// Slices `items` to one page, clamping `page` into [1, totalPages] so a stale
// page number (after a search/sort change shrinks the result set) never
// produces an out-of-range slice.
export function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: clamped,
    totalPages,
  };
}
