'use strict';

// Pure tour-list logic: sorting, fuzzy search, paging.

const tourTime = (t) => new Date(t.createdAt).getTime() || 0;

export const SORTERS = {
  'date-desc': (a, b) => tourTime(b) - tourTime(a),
  'date-asc': (a, b) => tourTime(a) - tourTime(b),
  'name-asc': (a, b) => (a.name || '').localeCompare(b.name || ''),
  'name-desc': (a, b) => (b.name || '').localeCompare(a.name || ''),
  'length-desc': (a, b) => (b.distance || 0) - (a.distance || 0),
  'length-asc': (a, b) => (a.distance || 0) - (b.distance || 0),
};

// Subsequence match: every char of the query appears in order. Returns the
// matched indices into `text`, or null when it doesn't fully match.
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

// Higher is better; null means no match. Ranks an exact/prefix/word-boundary
// substring above a merely contiguous one, and any contiguous run above a
// scattered subsequence — a tighter scatter still beats a sprawling one — so
// short queries (which match almost everything as a scattered subsequence)
// still float the real hits to the top.
export function matchScore(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = (text || '').toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) {
    if (idx === 0 && t.length === q.length) return 1000;
    if (idx === 0) return 900;
    if (t[idx - 1] === ' ' || t[idx - 1] === '-') return 800;
    return 600;
  }
  const indices = fuzzyMatchIndices(q, t);
  if (!indices) return null;
  if (indices.length === 0) return 0;
  const span = indices[indices.length - 1] - indices[0] + 1;
  return Math.max(1, 400 - span);
}

// Ranks by relevance when searching name and description; falls back to the
// chosen sort (as tiebreaker, and outright when the box is empty).
export function visibleTours(tours, sort, search) {
  const sorter = SORTERS[sort] || SORTERS['date-desc'];
  const q = (search || '').trim();
  if (!q) return [...tours].sort(sorter);
  return tours
    .map((tour) => {
      const nameScore = matchScore(q, tour.name || '');
      if (nameScore !== null) return { tour, score: nameScore };
      const descScore = matchScore(q, tour.description || '');
      // Pushed below every name match, however weak, since a hit buried in
      // the description is a weaker signal than any hit in the name.
      return descScore !== null ? { tour, score: descScore - 1000 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || sorter(a.tour, b.tour))
    .map(({ tour }) => tour);
}

// "In view" means partially on screen, not fully contained. Takes a plain
// {south, west, north, east} rather than a Leaflet LatLngBounds so this stays
// framework-free. A tour whose heatmapData isn't loaded yet counts as out.
export function toursInView(tours, bounds) {
  if (!bounds) return tours;
  const { south, west, north, east } = bounds;
  return tours.filter((t) =>
    (t.heatmapData || []).some(
      ([lat, lon]) => lat >= south && lat <= north && lon >= west && lon <= east,
    ),
  );
}

// Keeps the original time-of-day, so correcting a tour's date doesn't clobber
// the time it was recorded at.
export function withUpdatedDate(originalIso, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const combined = new Date(originalIso);
  combined.setUTCFullYear(y, m - 1, d);
  return combined.toISOString();
}

export const PAGE_SIZE = 10;

// Clamps `page` into range, so a stale page number left over from a larger
// result set never produces an empty slice.
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
