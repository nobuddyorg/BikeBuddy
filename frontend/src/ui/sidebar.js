'use strict';

import * as i18n from '../lib/i18n.js';
import { formatDate, formatDistance } from '../lib/format.js';
import { visibleTours, toursInView, paginate, PAGE_SIZE, fuzzyMatchIndices } from '../lib/tours.js';
import { isStale, markFetched } from '../lib/sasCache.js';
import { state } from './state.js';
import { mapBoundsPlain } from './map.js';
import { apiFetch } from './auth.js';
import { renderAllRoutes, renderSelectedToursRoutes } from './routes.js';
import { deleteTourById, selectTour, closeDetailPanel, focusTourOnMap } from './tour-detail.js';
import { toast } from './toast.js';
import {
  show,
  elSidebar,
  elTourList,
  elTourCount,
  elNoTours,
  elTourLoadError,
  elTourLoading,
  elTourControls,
  elFilterInViewToggle,
  elLineStyleWrap,
  elBtnShowAll,
  elBtnSelectMode,
  elSelectionBar,
  elSelectionCount,
  elBtnDeleteSelected,
  elTourPager,
  elTourPagerLabel,
  elTourPagerPrev,
  elTourPagerNext,
} from './dom.js';

const t = i18n.t;

export async function loadTours() {
  // Fired alongside /api/tours rather than after it: on a cold backend both
  // pay the same cold-start latency, so starting them together instead of in
  // sequence roughly halves the wait before the map can render.
  const mapDataPromise = apiFetch('/api/map');
  mapDataPromise.catch(() => {}); // avoid an unhandled-rejection warning if renderAllRoutes never consumes it
  state.toursLoadFailed = false;
  try {
    const res = await apiFetch('/api/tours');
    if (!res.ok) throw new Error('load failed');
    state.tours = await res.json();
  } catch {
    state.tours = [];
    state.toursLoadFailed = true;
    toast(t('toast.toursLoadError'), 'error');
  } finally {
    state.loadingTours = false;
  }
  renderSidebar();
  await renderAllRoutes(mapDataPromise);
}

// Keyed on the explicit flag rather than on heatmapData/images being present:
// ensureMapData fills those in too, from the leaner /api/map payload. Expires
// ahead of the signed URLs it holds, so a long-open tab refetches.
export async function ensureDetail(tour) {
  if (tour.detailLoaded && !isStale(tour)) return;
  try {
    const res = await apiFetch(`/api/tours/${tour.id}`);
    if (res.ok) {
      const detail = await res.json();
      tour.heatmapData = detail.heatmapData || [];
      tour.images = detail.images || [];
      tour.gpxFileUrl = detail.gpxFileUrl;
    }
  } catch {
    // offline — the fallbacks below keep callers working
  }
  tour.heatmapData = tour.heatmapData || [];
  tour.images = tour.images || [];
  tour.detailLoaded = true;
  markFetched(tour);
}

// textContent, never innerHTML: tour names are user-supplied.
function textDiv(className, text) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

// Long-press is mobile's only way into select mode once the Select button is
// hidden there. Wired unconditionally — Pointer Events cover mouse
// click-and-hold too, alongside the button.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const SWIPE_ACTION_THRESHOLD_PX = 72;

// Revealing the selection bar shifts every row down, so a long-press's ghost
// click can land anywhere in the sidebar — even on Cancel/Delete — not just on
// #tour-list. elSidebar is the nearest ancestor that survives the re-render and
// contains both. The timeout covers the browsers that suppress the ghost click
// entirely, where nothing would otherwise clear the flag.
let suppressNextTourClick = false;

function suppressNextTourClickOnce() {
  suppressNextTourClick = true;
  setTimeout(() => {
    suppressNextTourClick = false;
  }, 400);
}

elSidebar.addEventListener(
  'click',
  (e) => {
    if (suppressNextTourClick) {
      e.stopImmediatePropagation();
      suppressNextTourClick = false;
    }
  },
  true,
);

// onLongPress fires from pointerup, not from the 500ms timer: firing it while
// the pointer is still down lets its re-render destroy the <li> mid-gesture,
// and the browser then retargets the pending pointerup/click to whatever has
// taken its place.
function bindLongPress(el, onLongPress) {
  let timer = null;
  let start = null;
  let ready = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    start = null;
    ready = false;
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ready = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      ready = true;
    }, LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) cancel();
  });

  el.addEventListener('pointerup', () => {
    clearTimeout(timer);
    timer = null;
    start = null;
    if (ready) {
      ready = false;
      if (onLongPress()) suppressNextTourClickOnce();
    }
  });
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
}

// Touch-only, like bindLongPress. Dragging contentEl uncovers whichever of its
// two sibling backgrounds the direction points at; past
// SWIPE_ACTION_THRESHOLD_PX on release, right deletes and left opens the
// detail panel. Anything less snaps back — release only ever looks at the
// final dx, so a drag-back needs no cancelled state of its own.
function bindTourSwipe(contentEl, tour) {
  let start = null;
  let dragging = false;

  const reset = () => {
    contentEl.style.transition = 'transform 0.2s';
    contentEl.style.transform = 'translateX(0)';
    start = null;
    dragging = false;
  };

  contentEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || state.selectMode) return;
    start = { x: e.clientX, y: e.clientY };
    dragging = false;
  });

  contentEl.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging && Math.abs(dy) > Math.abs(dx)) {
      start = null; // vertical scroll intent — let the browser handle it
      return;
    }
    dragging = true;
    contentEl.style.transition = 'none';
    // Half the row's width: each background occupies one half, and an overshoot
    // past that starts revealing the other action's on the far edge.
    const maxDx = contentEl.offsetWidth / 2;
    const clampedDx = Math.max(-maxDx, Math.min(maxDx, dx));
    contentEl.style.transform = `translateX(${clampedDx}px)`;
  });

  contentEl.addEventListener('pointerup', async (e) => {
    if (!dragging) {
      start = null;
      return;
    }
    const dx = e.clientX - start.x;
    reset();
    if (dx >= SWIPE_ACTION_THRESHOLD_PX) {
      // Once the list re-renders without this tour, a trailing ghost click
      // would land on whatever row took its place.
      suppressNextTourClickOnce();
      await deleteTourById(tour.id);
    } else if (dx <= -SWIPE_ACTION_THRESHOLD_PX) {
      // No suppression needed here: nothing shifts, so the ghost click lands
      // back on this row, where highlightTour's same-tour guard eats it.
      selectTour(tour.id);
    }
  });

  contentEl.addEventListener('pointercancel', reset);
  contentEl.addEventListener('pointerleave', () => {
    if (dragging) reset();
  });
}

// Wraps runs of matched indices in <mark>, via createElement/textContent only —
// tour names are user-supplied.
function highlightedNameNode(name, indices) {
  name = name || '';
  const div = document.createElement('div');
  div.className = 'tour-item-name';
  const matched = new Set(indices);
  let i = 0;
  while (i < name.length) {
    let j = i;
    while (j < name.length && matched.has(j) === matched.has(i)) j++;
    const run = name.slice(i, j);
    if (matched.has(i)) {
      const mark = document.createElement('mark');
      mark.textContent = run;
      div.appendChild(mark);
    } else {
      div.appendChild(document.createTextNode(run));
    }
    i = j;
  }
  return div;
}

// Glyphs rather than emoji: these sit on coloured backgrounds and had to read
// the same regardless of platform emoji rendering.
const TRASH_ICON_SVG =
  '<svg class="tour-item-delete-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="#000" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>' +
  '</svg>';

const DETAIL_ICON_SVG =
  '<svg class="tour-item-detail-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="#000" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>' +
  '</svg>';

function createTourItem(tour) {
  const li = document.createElement('li');
  li.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');

  const deleteBg = document.createElement('div');
  deleteBg.className = 'tour-item-delete-bg';
  deleteBg.setAttribute('aria-hidden', 'true');
  deleteBg.innerHTML = TRASH_ICON_SVG;

  const detailBg = document.createElement('div');
  detailBg.className = 'tour-item-detail-bg';
  detailBg.setAttribute('aria-hidden', 'true');
  detailBg.innerHTML = DETAIL_ICON_SVG;

  const content = document.createElement('div');
  content.className = 'tour-item-content';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tour-item-checkbox';
  checkbox.checked = state.selectedIds.has(tour.id);
  checkbox.setAttribute('aria-hidden', 'true');
  show(checkbox, state.selectMode);

  const details = document.createElement('div');
  details.className = 'tour-item-details';
  details.append(
    highlightedNameNode(tour.name, fuzzyMatchIndices(state.search, tour.name)),
    textDiv(
      'tour-item-meta',
      `${formatDate(tour.createdAt, i18n.dateLocale())} · ${formatDistance(tour.distance)}`,
    ),
  );

  content.append(checkbox, details);
  // A click event isn't reliably a PointerEvent across browsers, so the input
  // type has to come from the preceding pointerdown.
  let lastPointerType = null;
  content.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType;
  });
  content.addEventListener('click', () => {
    if (state.selectMode) {
      toggleTourSelection(tour.id);
    } else if (lastPointerType === 'touch') {
      // On touch the panel is swipe-left's job and select mode is
      // long-press's, so a tap only highlights.
      highlightTour(tour.id);
    } else {
      selectTour(tour.id);
    }
  });
  bindLongPress(content, () => {
    if (state.selectMode) return false;
    enterSingleSelect(tour.id);
    return true;
  });
  bindTourSwipe(content, tour);

  li.append(deleteBg, detailBg, content);
  return li;
}

export function renderSidebar() {
  const signedIn = !!state.user;
  const loading = signedIn && state.loadingTours;
  const failed = signedIn && !loading && state.toursLoadFailed;
  const hasTours = signedIn && !loading && !failed && state.tours.length > 0;

  show(elTourLoading, loading);
  show(elTourLoadError, failed);
  show(elFilterInViewToggle, hasTours);
  show(elNoTours, signedIn && !loading && !failed && state.tours.length === 0);
  show(elTourControls, hasTours);
  show(elLineStyleWrap, hasTours);
  show(elTourList, hasTours);
  show(elBtnShowAll, hasTours);
  show(elBtnSelectMode, hasTours);
  show(elSelectionBar, hasTours && state.selectMode);
  elTourCount.textContent = signedIn && !loading ? state.tours.length : '0';
  elSelectionCount.textContent = t('sidebar.selectedCount', { count: state.selectedIds.size });
  elBtnDeleteSelected.disabled = state.selectedIds.size === 0;

  elTourList.innerHTML = '';
  if (!hasTours) {
    show(elTourPager, false);
    return;
  }

  const scoped = state.filterInView ? toursInView(state.tours, mapBoundsPlain()) : state.tours;
  const visible = visibleTours(scoped, state.sort, state.search);
  if (visible.length === 0) {
    elTourList.appendChild(textDiv('tour-empty', t('tours.noMatch')));
    show(elTourPager, false);
    return;
  }

  const { items, page, totalPages } = paginate(visible, state.page, PAGE_SIZE);
  state.page = page;
  items.forEach((tour) => elTourList.appendChild(createTourItem(tour)));

  show(elTourPager, totalPages > 1);
  elTourPagerLabel.textContent = t('sidebar.pagerLabel', { page, totalPages });
  elTourPagerPrev.disabled = page <= 1;
  elTourPagerNext.disabled = page >= totalPages;
}

export function toggleTourSelection(tourId) {
  if (state.selectedIds.has(tourId)) {
    state.selectedIds.delete(tourId);
  } else {
    state.selectedIds.add(tourId);
  }
  renderSidebar();
  renderSelectedToursRoutes();
}

export function enterSelectMode() {
  state.selectMode = true;
  renderSidebar();
}

// Long-press only — a plain tap highlights instead.
function enterSingleSelect(tourId) {
  enterSelectMode();
  toggleTourSelection(tourId);
}

// A tap's half of what a desktop click does: select and focus the map, but
// leave the panel to swipe-left. Any panel already open belongs to another
// tour, and its actions all read selectedTourId, so it has to close.
//
// The same-tour early return is load-bearing, not just an optimisation: it is
// what stops a swipe-left's own trailing ghost click from closing the panel
// that swipe just opened.
export function highlightTour(tourId) {
  if (state.selectedTourId === tourId) return;
  closeDetailPanel();
  state.selectedTourId = tourId;
  renderSidebar();
  focusTourOnMap(tourId); // a plain tap must focus the map like a click does
}

export function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  renderSidebar();
  renderAllRoutes();
}
