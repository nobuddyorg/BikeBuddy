import { state } from './state.js';
import { parseAppUrl, buildAppUrl } from '../lib/url.js';

// One entry per pushState, so popstate knows how many layers to close to reach its depth.
const layerStack = [];
let pendingTourId = '';

function currentUrl() {
  return buildAppUrl(
    {
      sort: state.sort,
      search: state.search,
      inView: state.filterInView,
      tourId: state.selectedTourId,
    },
    location.pathname,
  );
}

// The deep-linked tour opens only once the tours have loaded (consumeDeepLinkTourId).
export function readInitialUrl() {
  const parsed = parseAppUrl(location.search, location.hash);
  if (parsed.sort) state.sort = parsed.sort;
  if (parsed.search) state.search = parsed.search;
  if (parsed.inView) state.filterInView = true;
  pendingTourId = parsed.tourId;
}

export function consumeDeepLinkTourId() {
  const tourId = pendingTourId;
  pendingTourId = '';
  return tourId;
}

// Filter and selection changes replace the entry; only opening a layer adds one.
export function syncUrl() {
  history.replaceState(history.state, '', currentUrl());
}

// Back pops the entry and runs `close` once; the open path must never call it itself.
export function pushLayer(close) {
  layerStack.push(close);
  history.pushState({ depth: layerStack.length }, '', currentUrl());
}

export function initHistory() {
  window.addEventListener('popstate', () => {
    const depth = history.state?.depth ?? 0;
    while (layerStack.length > depth) layerStack.pop()();
  });
}
