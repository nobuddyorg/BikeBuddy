'use strict';

// Pure URL <-> state-patch mapping, kept separate from the history.pushState/
// popstate wiring in ui/router.js so it's unit-testable without a DOM/window.

const TOUR_HASH_RE = /^#\/tour\/([^/?#]+)$/;
const DEFAULT_SORT = 'date-desc';

export function parseAppUrl(search, hash) {
  const params = new URLSearchParams(search || '');
  const match = TOUR_HASH_RE.exec(hash || '');
  return {
    tourId: match ? decodeURIComponent(match[1]) : null,
    sort: params.get('sort') || null,
    search: params.get('q') || null,
    inView: params.get('inView') === '1',
  };
}

export function buildAppUrl({ tourId, sort, search, inView }, path) {
  const params = new URLSearchParams();
  if (sort && sort !== DEFAULT_SORT) params.set('sort', sort);
  if (search) params.set('q', search);
  if (inView) params.set('inView', '1');
  const query = params.toString();
  const hash = tourId ? `#/tour/${encodeURIComponent(tourId)}` : '';
  return `${path}${query ? `?${query}` : ''}${hash}`;
}
