// @ts-check

export const PAGE_SIZE = 10;

// In the order the sort controls list them; labelKey is the i18n key.
export const SORT_OPTIONS = [
  { key: 'date-desc', labelKey: 'sort.dateDesc' },
  { key: 'date-asc', labelKey: 'sort.dateAsc' },
  { key: 'name-asc', labelKey: 'sort.nameAsc' },
  { key: 'name-desc', labelKey: 'sort.nameDesc' },
  { key: 'length-desc', labelKey: 'sort.lengthDesc' },
  { key: 'length-asc', labelKey: 'sort.lengthAsc' },
];
export const DEFAULT_SORT = SORT_OPTIONS[0].key;

// An exact name beats a prefix, a word start, a substring, then any scattered subsequence.
const EXACT_SCORE = 1000;
const PREFIX_SCORE = 900;
const WORD_START_SCORE = 800;
const SUBSTRING_SCORE = 600;
const SUBSEQUENCE_CEILING = 400;
// Pushes a description hit below every name hit, however weak.
const DESCRIPTION_PENALTY = 1000;

const tourTime = (tour) => new Date(tour.createdAt).getTime() || 0;

function sorters(locale) {
  const collator = new Intl.Collator(locale);
  return {
    'date-desc': (a, b) => tourTime(b) - tourTime(a),
    'date-asc': (a, b) => tourTime(a) - tourTime(b),
    'name-asc': (a, b) => collator.compare(a.name || '', b.name || ''),
    'name-desc': (a, b) => collator.compare(b.name || '', a.name || ''),
    'length-desc': (a, b) => (b.distance || 0) - (a.distance || 0),
    'length-asc': (a, b) => (a.distance || 0) - (b.distance || 0),
  };
}

// Every query character in order; a miss or an empty query highlights nothing.
export function fuzzyMatchIndices(query, text) {
  const needle = query.trim().toLowerCase();
  const haystack = (text || '').toLowerCase();
  const indices = [];
  for (let position = 0; position < haystack.length && indices.length < needle.length; position++) {
    if (haystack[position] === needle[indices.length]) indices.push(position);
  }
  const matched = indices.length === needle.length;
  return { matched, indices: matched ? indices : [] };
}

function contiguousScore({ haystack, needle, start }) {
  if (start === 0 && haystack.length === needle.length) return EXACT_SCORE;
  if (start === 0) return PREFIX_SCORE;
  if (haystack[start - 1] === ' ' || haystack[start - 1] === '-') return WORD_START_SCORE;
  return SUBSTRING_SCORE;
}

// Any contiguous run outranks a scatter, and a tight scatter outranks a sprawling one.
export function matchScore(query, text) {
  const needle = query.trim().toLowerCase();
  if (!needle) return { matched: true, score: 0 };
  const haystack = (text || '').toLowerCase();
  const start = haystack.indexOf(needle);
  if (start !== -1) return { matched: true, score: contiguousScore({ haystack, needle, start }) };
  const { matched, indices } = fuzzyMatchIndices(needle, haystack);
  if (!matched) return { matched: false, score: 0 };
  const span = indices[indices.length - 1] - indices[0] + 1;
  return { matched: true, score: Math.max(1, SUBSEQUENCE_CEILING - span) };
}

function relevance({ tour, query }) {
  const byName = matchScore(query, tour.name || '');
  if (byName.matched) return [{ tour, score: byName.score }];
  const byDescription = matchScore(query, tour.description || '');
  if (!byDescription.matched) return [];
  return [{ tour, score: byDescription.score - DESCRIPTION_PENALTY }];
}

// Relevance first; the chosen sort breaks ties, and is the only order without a query.
export function visibleTours({ tours, sort, search, locale }) {
  const byKey = sorters(locale);
  const sorter = byKey[sort] || byKey[DEFAULT_SORT];
  const query = (search || '').trim();
  if (!query) return [...tours].sort(sorter);
  return tours
    .flatMap((tour) => relevance({ tour, query }))
    .sort((a, b) => b.score - a.score || sorter(a.tour, b.tour))
    .map(({ tour }) => tour);
}

// Partially on screen counts as in view; a tour without loaded heatmapData does not.
export function toursInView(tours, bounds) {
  const { south, west, north, east } = bounds;
  return tours.filter((tour) =>
    (tour.heatmapData || []).some(
      ([lat, lon]) => lat >= south && lat <= north && lon >= west && lon <= east,
    ),
  );
}

// A stale page number from a larger result set lands on the last page, not an empty one.
export function paginate({ items, page, pageSize }) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: clamped,
    totalPages,
  };
}

export function tourListView({ tours, sort, search, locale, page, inViewBounds }) {
  const scoped = inViewBounds ? toursInView(tours, inViewBounds) : tours;
  const visible = visibleTours({ tours: scoped, sort, search, locale });
  return {
    ...paginate({ items: visible, page, pageSize: PAGE_SIZE }),
    visibleCount: visible.length,
    totalCount: tours.length,
    filtered: Boolean(inViewBounds) || search.trim() !== '',
  };
}

export function matchRuns(text, indices) {
  const matched = new Set(indices);
  const runs = [];
  let runStart = 0;
  while (runStart < text.length) {
    const isMatched = matched.has(runStart);
    let runEnd = runStart;
    while (runEnd < text.length && matched.has(runEnd) === isMatched) runEnd++;
    runs.push({ text: text.slice(runStart, runEnd), matched: isMatched });
    runStart = runEnd;
  }
  return runs;
}

// Keeps the original time of day, so correcting the date keeps when it was recorded.
export function withUpdatedDate(originalIso, date) {
  const [year, month, day] = date.split('-').map(Number);
  const combined = new Date(originalIso);
  combined.setUTCFullYear(year, month - 1, day);
  return combined.toISOString();
}

// The UTC calendar date, as an <input type="date"> value.
export function toDateInputValue(iso) {
  return iso ? iso.slice(0, 10) : '';
}

export function buildTourPatch({ name, description, date, createdAt }) {
  return {
    name: name.trim(),
    description: description.trim(),
    createdAt: withUpdatedDate(createdAt, date),
  };
}

export function removeToursById(tours, ids) {
  return tours.filter((tour) => !ids.includes(tour.id));
}

export function deletionFailureMessage({ succeededCount, totalCount }) {
  if (succeededCount === 0) return { key: 'toast.tourDeleteError', params: {} };
  return {
    key: 'toast.toursDeletedPartial',
    params: { deleted: succeededCount, count: totalCount },
  };
}
