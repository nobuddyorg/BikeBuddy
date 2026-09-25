// @ts-check

import { DEFAULT_SORT } from './tours.js';

const TOUR_HASH_PATTERN = /^#\/tour\/([^/?#]+)$/;

export function parseAppUrl(search, hash) {
  const params = new URLSearchParams(search);
  const match = TOUR_HASH_PATTERN.exec(hash);
  return {
    tourId: match ? decodeURIComponent(match[1]) : '',
    sort: params.get('sort') || '',
    search: params.get('q') || '',
    inView: params.get('inView') === '1',
  };
}

export function buildAppUrl({ tourId, sort, search, inView }, path) {
  const params = new URLSearchParams();
  if (sort && sort !== DEFAULT_SORT) params.set('sort', sort);
  if (search) params.set('q', search);
  if (inView) params.set('inView', '1');
  const query = params.toString();
  const queryString = query ? `?${query}` : '';
  const hash = tourId ? `#/tour/${encodeURIComponent(tourId)}` : '';
  return `${path}${queryString}${hash}`;
}
