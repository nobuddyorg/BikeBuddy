'use strict';

import * as i18n from '../lib/i18n.js';
import { formatDate, formatDistance } from '../lib/format.js';
import { visibleTours, toursInView, paginate, PAGE_SIZE, fuzzyMatchIndices } from '../lib/tours.js';
import { isStale, markFetched } from '../lib/sasCache.js';
import { state } from './state.js';
import { mapBoundsPlain, isMobileLayout } from './map.js';
import { apiFetch } from './auth.js';
import { renderAllRoutes, renderSelectedToursRoutes } from './routes.js';
import { deleteTourById, selectTour } from './tour-detail.js';
import { consumeDeepLinkTourId, syncUrl } from './router.js';
import { toast } from './toast.js';
import {
  show,
  elAppLayout,
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
  elBtnMobileMapFab,
  elSelectionBar,
  elSelectionCount,
  elBtnDeleteSelected,
  elAuthPrompt,
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

  // Only meaningful on the first load — consumeDeepLinkTourId() clears the
  // pending id, so a later retry-button reload won't reopen it.
  const deepLinkId = consumeDeepLinkTourId();
  if (deepLinkId) {
    if (state.tours.some((tour) => tour.id === deepLinkId)) await selectTour(deepLinkId);
    else syncUrl(); // unknown/deleted tour: drop it from the URL, stay on the full map
  }
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
      tour.elevationGain = detail.elevationGain ?? null;
      tour.elevationLoss = detail.elevationLoss ?? null;
      tour.minElevation = detail.minElevation ?? null;
      tour.maxElevation = detail.maxElevation ?? null;
      tour.durationSeconds = detail.durationSeconds ?? null;
      tour.movingSeconds = detail.movingSeconds ?? null;
      tour.avgSpeed = detail.avgSpeed ?? null;
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

// Touch-only, like bindLongPress. Dragging contentEl right uncovers the
// delete background; past SWIPE_ACTION_THRESHOLD_PX on release, it deletes.
// Anything less snaps back — release only ever looks at the final dx, so a
// drag-back needs no cancelled state of its own.
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
    // Only the delete background exists now, so leftward drags are clamped
    // to 0 instead of revealing anything on that side.
    const maxDx = contentEl.offsetWidth / 2;
    const clampedDx = Math.max(0, Math.min(maxDx, dx));
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
  div.title = name; // full, unmarked name — a hover tooltip for the ellipsis-truncated row (#445)
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

function createTourItem(tour) {
  const li = document.createElement('li');
  li.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');

  const deleteBg = document.createElement('div');
  deleteBg.className = 'tour-item-delete-bg';
  deleteBg.setAttribute('aria-hidden', 'true');
  deleteBg.innerHTML = TRASH_ICON_SVG;

  const content = document.createElement('div');
  content.className = 'tour-item-content';
  content.tabIndex = 0;
  content.setAttribute(
    'aria-label',
    t('sidebar.tourItemAria', {
      name: tour.name || '',
      date: formatDate(tour.createdAt, i18n.dateLocale()),
      distance: formatDistance(tour.distance),
    }),
  );
  if (state.selectMode) {
    content.setAttribute('role', 'checkbox');
    content.setAttribute('aria-checked', String(state.selectedIds.has(tour.id)));
  } else {
    content.setAttribute('role', 'button');
  }
  if (tour.id === state.selectedTourId) content.setAttribute('aria-current', 'true');

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
  content.addEventListener('click', () => {
    if (state.selectMode) toggleTourSelection(tour.id);
    else selectTour(tour.id);
  });
  content.addEventListener('keydown', (e) => {
    // Space also scrolls the list by default; only suppress that once this
    // row is actually the one handling the key.
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    content.click();
  });
  bindLongPress(content, () => {
    if (state.selectMode) return false;
    enterSingleSelect(tour.id);
    return true;
  });
  bindTourSwipe(content, tour);

  li.append(deleteBg, content);
  return li;
}

export function renderSidebar() {
  const signedIn = !!state.user;
  const loading = signedIn && state.loadingTours;
  const failed = signedIn && !loading && state.toursLoadFailed;
  const hasTours = signedIn && !loading && !failed && state.tours.length > 0;

  show(elAuthPrompt, !signedIn);
  show(elTourLoading, loading);
  show(elTourLoadError, failed);
  show(elFilterInViewToggle, hasTours);
  show(elNoTours, signedIn && !loading && !failed && state.tours.length === 0);
  show(elTourControls, hasTours);
  show(elLineStyleWrap, hasTours);
  show(elTourList, hasTours);
  show(elBtnShowAll, hasTours);
  show(elBtnSelectMode, hasTours);
  // Guarded against the fullscreen map, whose own toggle owns this button's
  // visibility while active — an async render landing mid-expand must not
  // pop it back up behind/over the map.
  show(elBtnMobileMapFab, hasTours && !elAppLayout.classList.contains('map-expanded'));
  show(elSelectionBar, hasTours && state.selectMode);
  const selectedTour = hasTours && state.tours.find((tour) => tour.id === state.selectedTourId);
  elBtnShowAll.classList.toggle('active', !!selectedTour);
  elBtnShowAll.textContent = selectedTour
    ? t('tours.showAllFiltered', { name: selectedTour.name })
    : t('tours.showAll');
  elSelectionCount.textContent = t('sidebar.selectedCount', { count: state.selectedIds.size });
  elBtnDeleteSelected.disabled = state.selectedIds.size === 0;

  elTourList.innerHTML = '';
  if (!hasTours) {
    elTourCount.textContent = signedIn && !loading ? state.tours.length : '0';
    show(elTourPager, false);
    return;
  }

  // The map isn't beside the list on mobile to pan/zoom while watching it
  // filter, and the toggle is hidden there — ignore a stray filterInView=true
  // left over from a desktop session or a shared/bookmarked ?inView=1 URL,
  // or the list would filter itself with no visible control to undo it.
  const inViewActive = state.filterInView && !isMobileLayout();
  const scoped = inViewActive ? toursInView(state.tours, mapBoundsPlain()) : state.tours;
  const visible = visibleTours(scoped, state.sort, state.search);
  const filterActive = inViewActive || state.search.trim() !== '';
  elTourCount.textContent = filterActive
    ? t('sidebar.filteredCount', { count: visible.length, total: state.tours.length })
    : String(state.tours.length);
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

// Long-press only — a plain tap opens the detail panel instead.
function enterSingleSelect(tourId) {
  enterSelectMode();
  toggleTourSelection(tourId);
}

export function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  renderSidebar();
  renderAllRoutes();
}
