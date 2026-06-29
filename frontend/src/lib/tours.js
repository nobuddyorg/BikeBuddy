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
