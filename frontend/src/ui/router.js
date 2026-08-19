'use strict';

import { state } from './state.js';
import { parseAppUrl, buildAppUrl } from '../lib/url.js';

// Each pushState call gets one entry here, in order, so a popstate can tell
// how many layers (detail panel, a modal, the lightbox) it needs to close to
// reach the depth the browser just navigated back to.
const layerStack = [];
let pendingTourId = null;

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

// Restores sort/search/inView synchronously so they survive a reload. The
// deep-linked tour id (if any) is only remembered here — state.tours isn't
// loaded yet, so opening it has to wait for consumeDeepLinkTourId().
export function readInitialUrl() {
  const parsed = parseAppUrl(location.search, location.hash);
  if (parsed.sort) state.sort = parsed.sort;
  if (parsed.search) state.search = parsed.search;
  if (parsed.inView) state.filterInView = true;
  pendingTourId = parsed.tourId;
}

export function consumeDeepLinkTourId() {
  const id = pendingTourId;
  pendingTourId = null;
  return id;
}

// Re-syncs the URL with current state without adding a history entry — for
// filter changes (sort/search/inView) and for selection changes that aren't
// "opening a panel" (Show All Tours, the map filter chip's clear button).
export function syncUrl() {
  history.replaceState(history.state, '', currentUrl());
}

// Opening a panel/modal/lightbox: pushes a history entry so the OS/browser
// Back gesture closes it instead of leaving the app. `close` runs once, from
// the popstate handler below, when Back pops past this layer — never call it
// directly from the open path itself.
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
