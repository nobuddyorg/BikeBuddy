import * as i18n from './i18n.js';
import { sidebarViewState } from '../lib/sidebarView.js';
import { state } from './state.js';
import { apiFetch } from './api.js';
import { renderAllRoutes } from './routes.js';
import { selectTour } from './tourPanel.js';
import { renderTourList } from './tourList.js';
import { consumeDeepLinkTourId, syncUrl } from './router.js';
import { toast } from './toast.js';
import {
  setVisible,
  appLayout,
  tourList,
  noToursState,
  tourLoadError,
  tourLoading,
  tourControls,
  inViewToggle,
  lineStyleControl,
  showAllButton,
  selectModeButton,
  mobileMapButton,
  selectionBar,
  selectionCount,
  deleteSelectedButton,
  authPrompt,
} from './dom.js';

const t = i18n.t;

async function fetchTours() {
  state.toursLoadFailed = false;
  try {
    const response = await apiFetch('/api/tours');
    if (!response.ok) throw new Error('load failed');
    state.tours = await response.json();
  } catch {
    state.tours = [];
    state.toursLoadFailed = true;
    toast(t('toast.toursLoadError'), { type: 'error' });
  } finally {
    state.loadingTours = false;
  }
}

// Only meaningful on the first load — consumeDeepLinkTourId() clears the
// pending id, so a later retry-button reload won't reopen it.
async function openDeepLinkedTour() {
  const deepLinkId = consumeDeepLinkTourId();
  if (!deepLinkId) return;
  if (state.tours.some((tour) => tour.id === deepLinkId)) await selectTour(deepLinkId);
  else syncUrl(); // unknown/deleted tour: drop it from the URL, stay on the full map
}

export async function loadTours() {
  // Fired alongside /api/tours rather than after it: on a cold backend both
  // pay the same cold-start latency, so starting them together instead of in
  // sequence roughly halves the wait before the map can render.
  const pendingMapResponse = apiFetch('/api/map');
  pendingMapResponse.catch(() => {}); // avoid an unhandled-rejection warning if renderAllRoutes never consumes it
  await fetchTours();
  renderSidebar();
  await renderAllRoutes({ pendingMapResponse });
  await openDeepLinkedTour();
}

function renderSelectionControls(hasTours) {
  setVisible(selectionBar, hasTours && state.selectMode);
  selectionCount.textContent = t('sidebar.selectedCount', { count: state.selectedIds.size });
  deleteSelectedButton.disabled = state.selectedIds.size === 0;
}

function renderShowAllButton(hasTours) {
  setVisible(showAllButton, hasTours);
  const selectedTour = hasTours && state.tours.find((tour) => tour.id === state.selectedTourId);
  showAllButton.classList.toggle('active', Boolean(selectedTour));
  showAllButton.textContent = selectedTour
    ? t('tours.showAllFiltered', { name: selectedTour.name })
    : t('tours.showAll');
}

export function renderSidebar() {
  const { signedIn, loading, failed, empty, hasTours } = sidebarViewState({
    signedIn: Boolean(state.user),
    loadingTours: state.loadingTours,
    toursLoadFailed: state.toursLoadFailed,
    tourCount: state.tours.length,
  });

  setVisible(authPrompt, !signedIn);
  setVisible(tourLoading, loading);
  setVisible(tourLoadError, failed);
  setVisible(noToursState, empty);
  for (const control of [
    inViewToggle,
    tourControls,
    lineStyleControl,
    tourList,
    selectModeButton,
  ]) {
    setVisible(control, hasTours);
  }
  // Guarded against the fullscreen map, whose own toggle owns this button's
  // visibility while active — an async render landing mid-expand must not
  // pop it back up behind/over the map.
  setVisible(mobileMapButton, hasTours && !appLayout.classList.contains('map-expanded'));
  renderShowAllButton(hasTours);
  renderSelectionControls(hasTours);
  renderTourList({ signedIn, loading, hasTours });
}
