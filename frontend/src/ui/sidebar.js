import * as i18n from './i18n.js';
import { sidebarViewState } from '../lib/sidebarView.js';
import { state } from './state.js';
import { apiFetch } from './api.js';
import { renderAllRoutes } from './routes.js';
import { selectTour } from './tourPanel.js';
import { renderTourList } from './tourList.js';
import { consumeDeepLinkTourId, syncUrl } from './router.js';
import { toast } from './toast.js';
import { pendingKeys } from './undoableAction.js';
import { tourKey } from '../lib/tours.js';
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
    const response = await apiFetch('/api/v1/tours');
    if (!response.ok) throw new Error('load failed');
    // A tour deleted within the Undo window is gone for the rider, whatever the server still says.
    const pending = pendingKeys();
    state.tours = (await response.json()).filter((tour) => !pending.has(tourKey(tour.id)));
  } catch {
    state.tours = [];
    state.toursLoadFailed = true;
    toast(t('toast.toursLoadError'), { type: 'error' });
  } finally {
    state.loadingTours = false;
  }
}

// Only the first load has a deep link; consuming it keeps a retry from reopening it.
async function openDeepLinkedTour() {
  const deepLinkId = consumeDeepLinkTourId();
  if (!deepLinkId) return;
  if (state.tours.some((tour) => tour.id === deepLinkId)) await selectTour(deepLinkId);
  else syncUrl(); // an unknown or deleted tour leaves the URL
}

export async function loadTours() {
  // Started with /api/v1/tours: a cold backend then pays its start-up latency once.
  const pendingMapResponse = apiFetch('/api/v1/map');
  // Marked handled: ensureMapData awaits it only while a tour still lacks map data.
  pendingMapResponse.catch(() => {});
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
  // The expanded map owns this button while it is open.
  setVisible(mobileMapButton, hasTours && !appLayout.classList.contains('map-expanded'));
  renderShowAllButton(hasTours);
  renderSelectionControls(hasTours);
  renderTourList({ signedIn, loading, hasTours });
}
