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
export const DEFAULT_SORT = 'date-desc';

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
  for (let position = 0; position < haystack.length; position++) {
    if (haystack[position] === needle[indices.length]) indices.push(position);
  }
  const matched = indices.length === needle.length;
  return { matched, indices: matched ? indices : [] };
}

function contiguousScore({ haystack, needle, start }) {
  if (haystack === needle) return EXACT_SCORE;
  if (start === 0) return PREFIX_SCORE;
  if (haystack[start - 1] === ' ' || haystack[start - 1] === '-') return WORD_START_SCORE;
  return SUBSTRING_SCORE;
}

// Any contiguous run outranks a scatter, and a tight scatter outranks a sprawling one.
export function matchScore(query, text) {
  const needle = query.trim().toLowerCase();
  if (!needle) return { matched: true, score: 0 };
  const haystack = text.toLowerCase();
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
  // Without a query every tour matches neutrally, so the chosen sort alone decides.
  return tours
    .flatMap((tour) => relevance({ tour, query: search || '' }))
    .sort((a, b) => b.score - a.score || sorter(a.tour, b.tour))
    .map(({ tour }) => tour);
}

// Per points array: a refetch assigns a new array, so an extent can never go stale.
const extents = new WeakMap();

function extentOf(points) {
  if (!extents.has(points)) {
    extents.set(
      points,
      points.reduce(
        (extent, [lat, lon]) => ({
          south: Math.min(extent.south, lat),
          north: Math.max(extent.north, lat),
          west: Math.min(extent.west, lon),
          east: Math.max(extent.east, lon),
        }),
        { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity },
      ),
    );
  }
  return extents.get(points);
}

// A tour wholly outside is dropped by its extent, unscanned; any other stops at its first point in view.
const extentOutside = (bounds, extent) =>
  extent.north < bounds.south ||
  extent.south > bounds.north ||
  extent.east < bounds.west ||
  extent.west > bounds.east;

const isInside =
  ({ south, west, north, east }) =>
  ([lat, lon]) =>
    lat >= south && lat <= north && lon >= west && lon <= east;

// Partially on screen counts as in view; a tour without loaded heatmapData does not.
export function toursInView(tours, bounds) {
  return tours.filter((tour) => {
    const points = tour.heatmapData;
    if (!points?.length) return false;
    if (extentOutside(bounds, extentOf(points))) return false;
    return points.some(isInside(bounds));
  });
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
  for (let index = 0; index < text.length; index++) {
    const isMatched = matched.has(index);
    const lastRun = runs[runs.length - 1];
    if (lastRun?.matched === isMatched) lastRun.text += text[index];
    else runs.push({ text: text[index], matched: isMatched });
  }
  return runs;
}

// The calendar date and time of day an instant shows in timeZone (undefined: the browser's own).
function wallClock(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function offsetMs(instantMs, timeZone) {
  const shown = wallClock(new Date(instantMs), timeZone);
  const shownAsUtc = Date.UTC(
    Number(shown.year),
    Number(shown.month) - 1,
    Number(shown.day),
    Number(shown.hour),
    Number(shown.minute),
    Number(shown.second),
  );
  return shownAsUtc - Math.floor(instantMs / 1000) * 1000;
}

// The date as the detail view shows it; keeps the local time of day the ride was recorded at.
export function withUpdatedDate(originalIso, date, timeZone) {
  const original = new Date(originalIso);
  const time = wallClock(original, timeZone);
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(
    year,
    month - 1,
    day,
    Number(time.hour),
    Number(time.minute),
    Number(time.second),
    original.getUTCMilliseconds(),
  );
  // A second pass settles a daylight-saving change between the guess and the answer; when the
  // two disagree the time falls in the spring-forward gap, and the guess moves it forward.
  const guess = target - offsetMs(target, timeZone);
  const settled = target - offsetMs(guess, timeZone);
  const inGap = offsetMs(settled, timeZone) !== offsetMs(guess, timeZone);
  return new Date(inGap ? guess : settled).toISOString();
}

// The local calendar date, as an <input type="date"> value.
export function toDateInputValue(iso, timeZone) {
  if (!iso) return '';
  const { year, month, day } = wallClock(new Date(iso), timeZone);
  return `${year}-${month}-${day}`;
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

// The key a pending tour delete is filed under (ui/undoableAction.js), to hide it from a refetch.
export const tourKey = (tourId) => `tour:${tourId}`;

// A DELETE that finds nothing left to delete (another tab, a repeated request) still succeeded.
export const isDeleted = (response) => response.ok || response.status === 404;
