import * as i18n from './i18n.js';
import { state } from './state.js';
import { apiFetch } from './api.js';
import { renderAllRoutes } from './routes.js';
import { selectTour } from './tour-detail.js';
import { renderTourList } from './tourList.js';
import { consumeDeepLinkTourId, syncUrl } from './router.js';
import { toast } from './toast.js';
import {
  show,
  elAppLayout,
  elTourList,
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

  renderTourList({ signedIn, loading, hasTours });
}
