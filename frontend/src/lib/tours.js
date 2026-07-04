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
export function fuzzyMatch(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = (text || '').toLowerCase();
  let i = 0;
  for (const ch of t) {
    if (ch === q[i] && ++i === q.length) return true;
  }
  return false;
}

// Tours filtered by the search box and ordered by the chosen sort.
export function visibleTours(tours, sort, search) {
  const sorter = SORTERS[sort] || SORTERS['date-desc'];
  return tours.filter((t) => fuzzyMatch(search, t.name)).sort(sorter);
}

export const PAGE_SIZE = 15;

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
