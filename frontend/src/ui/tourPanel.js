import * as i18n from './i18n.js';
import {
  formatDate,
  formatDistance,
  formatElevation,
  formatDuration,
  formatSpeed,
} from '../lib/format.js';
import { buildTourPatch, toDateInputValue } from '../lib/tours.js';
import { parseErrorMessage } from '../lib/upload.js';
import { state } from './state.js';
import { apiRequest } from './api.js';
import { toast } from './toast.js';
import { redrawAllRoutesInPlace, renderRoutes, SINGLE_TOUR_PADDING_PX } from './routes.js';
import { routePointSets } from '../lib/routes.js';
import { renderPins } from './pins.js';
import { ensureDetail } from './tourData.js';
import { resetImageSection, renderGallery } from './gallery.js';
import { announce, TOURS_CHANGED } from './events.js';
import {
  refreshMapSize,
  isMobileLayout,
  moveMapIntoDetailPanel,
  restoreMapToAppLayout,
} from './map.js';
import {
  showElement,
  hideElement,
  isHidden,
  mapEmptyOverlay,
  mobileMapButton,
  detailPanel,
  detailName,
  detailDate,
  detailDistance,
  detailElevationGain,
  detailDuration,
  detailAverageSpeed,
  detailDescription,
  editModal,
  editNameInput,
  editDateInput,
  editDescriptionInput,
  editError,
} from './dom.js';
import { openModal, closeModal } from './modal.js';
import { pushLayer, releaseLayer, syncUrl } from './router.js';

const t = i18n.t;

const selectedTour = () => state.tours.find((tour) => tour.id === state.selectedTourId);

// Resolves to whether the tour is still selected once its detail has loaded.
async function focusTourOnMap(tour) {
  const loaded = await ensureDetail(tour);
  if (state.selectedTourId !== tour.id) return false;
  if (!loaded) toast(t('toast.tourDetailError'), { type: 'error' });
  hideElement(mapEmptyOverlay);
  renderRoutes(routePointSets([tour]), SINGLE_TOUR_PADDING_PX);
  renderPins();
  return true;
}

export async function selectTour(tourId) {
  const tour = state.tours.find((candidate) => candidate.id === tourId);
  if (!tour) return;

  const panelWasOpen = !isHidden(detailPanel);
  state.selectedTourId = tourId;
  announce(TOURS_CHANGED);
  renderDetailPanel(tour);
  // Pushed after the URL shows the tour, so Back closes the panel and keeps the selection.
  // Switching tours in an open panel reuses its entry, so one Back always closes it.
  if (!panelWasOpen) pushLayer(closeDetailPanel);
  state.detailLoading = focusTourOnMap(tour).then((stillSelected) => {
    if (!stillSelected) return;
    renderDetailMeta(tour); // these metrics arrive only with the detail
    renderGallery(tour);
  });
  await state.detailLoading;
}

// Only "Show all tours" (desktop) or reopening the map (mobile) singles out a tour again.
export function closeDetailPanel() {
  hideElement(detailPanel);
  releaseLayer(closeDetailPanel);
  const wasMobile = isMobileLayout();
  if (wasMobile) restoreMapToAppLayout();
  state.selectedTourId = null;
  announce(TOURS_CHANGED);
  syncUrl();
  // Mobile's map is off-screen; it draws fresh when reopened.
  if (!wasMobile) redrawAllRoutesInPlace();
  showElement(mobileMapButton);
  refreshMapSize();
}

export function openEdit() {
  const tour = selectedTour();
  if (!tour) return;
  editNameInput.value = tour.name || '';
  editDateInput.value = toDateInputValue(tour.createdAt);
  editDescriptionInput.value = tour.description || '';
  hideElement(editError);
  openModal(editModal);
}

export function closeEdit() {
  closeModal(editModal);
}

function showEditError(message) {
  editError.textContent = message;
  showElement(editError);
}

export async function submitEdit(event) {
  event.preventDefault();
  const tour = selectedTour();
  if (!tour) return;

  hideElement(editError);
  const { response, networkError } = await apiRequest(`/api/v1/tours/${tour.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      buildTourPatch({
        name: editNameInput.value,
        description: editDescriptionInput.value,
        date: editDateInput.value,
        createdAt: tour.createdAt,
      }),
    ),
  });
  if (networkError) {
    showEditError(t('errors.network'));
    return;
  }
  if (!response.ok) {
    showEditError(i18n.tApi(parseErrorMessage(await response.text(), t('errors.saveChanges'))));
    return;
  }
  const updated = await response.json();
  Object.assign(tour, {
    name: updated.name,
    description: updated.description,
    createdAt: updated.createdAt,
  });
  closeEdit();
  announce(TOURS_CHANGED);
  renderDetailPanel(tour);
}

function renderDetailMeta(tour) {
  const locale = i18n.intlLocale();
  detailName.textContent = tour.name;
  detailDate.textContent = formatDate(tour.createdAt, locale);
  detailDistance.textContent = formatDistance(tour.distance, locale);
  detailElevationGain.textContent = formatElevation(tour.elevationGain, locale);
  detailDuration.textContent = formatDuration(tour.durationSeconds, locale);
  detailAverageSpeed.textContent = formatSpeed(tour.avgSpeed, locale);
  detailDescription.textContent = tour.description || '';
}

function renderDetailPanel(tour) {
  renderDetailMeta(tour);
  resetImageSection();
  showElement(detailPanel);
  if (isMobileLayout()) moveMapIntoDetailPanel();
  // Hidden, not just covered: it would stay focusable behind the full-screen panel.
  hideElement(mobileMapButton);
  refreshMapSize();
}

// A navigation reports no failure, so an expired URL would save storage's XML error as .gpx.
export async function downloadSelectedGpx() {
  const tour = selectedTour();
  if (!tour) return;
  const loaded = await ensureDetail(tour);
  if (!loaded || !tour.gpxFileUrl) {
    toast(t('toast.gpxDownloadError'), { type: 'error' });
    return;
  }
  const link = document.createElement('a');
  link.href = tour.gpxFileUrl;
  link.click();
}
