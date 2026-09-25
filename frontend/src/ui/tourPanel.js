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
import { pushLayer, syncUrl } from './router.js';

const t = i18n.t;

const selectedTour = () => state.tours.find((tour) => tour.id === state.selectedTourId);

// The map half of selecting a tour. Resolves to whether the tour is still the
// selected one once its detail has loaded.
async function focusTourOnMap(tour) {
  const loaded = await ensureDetail(tour);
  if (state.selectedTourId !== tour.id) return false;
  if (!loaded) toast(t('toast.tourDetailError'), { type: 'error' });
  hideElement(mapEmptyOverlay);
  renderRoutes([tour.heatmapData || []], SINGLE_TOUR_PADDING_PX);
  renderPins();
  return true;
}

export async function selectTour(tourId) {
  const tour = state.tours.find((candidate) => candidate.id === tourId);
  if (!tour) return;

  state.selectedTourId = tourId;
  announce(TOURS_CHANGED);
  renderDetailPanel(tour); // name/meta now; resets the image section
  // Pushed after the URL already reflects the new tour, so Back returns here
  // and closes the panel (#443) — the tour stays selected, matching #442.
  pushLayer(closeDetailPanel);
  state.detailLoading = focusTourOnMap(tour).then((stillSelected) => {
    if (!stillSelected) return;
    renderDetailMeta(tour); // elevation/duration/avgSpeed only land with this fetch
    renderGallery(tour);
  });
  await state.detailLoading;
}

// Neither surface leaves the map/pins scoped to the just-closed tour, and
// neither leaves its row looking "active" — only the explicit "Show all
// tours" button (desktop) or reopening the map (mobile) should single out a
// tour again.
export function closeDetailPanel() {
  hideElement(detailPanel);
  const wasMobile = isMobileLayout();
  if (wasMobile) restoreMapToAppLayout();
  state.selectedTourId = null;
  announce(TOURS_CHANGED);
  syncUrl();
  // Desktop's map is always visible, so it redraws immediately — every
  // route, but without re-fitting the camera, so closing the panel doesn't
  // yank the view around; only "Show all tours" does that. Mobile's map is
  // off-screen until reopened, which draws fresh then (renderSelectedToursRoutes).
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
  const { response, networkError } = await apiRequest(`/api/tours/${tour.id}`, {
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

// Split from renderDetailPanel so selectTour can refresh just the meta once
// ensureDetail's fetch lands elevationGain/durationSeconds/avgSpeed — those
// aren't in the list payload, only the single-tour one.
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
  // Otherwise it stays keyboard-focusable behind the full-screen mobile
  // panel even though the panel's opaque background covers it visually.
  hideElement(mobileMapButton);
  refreshMapSize();
}

// A navigation, not a fetch: the blob is cross-origin and its filename comes
// from the signed URL's Content-Disposition. Navigations report nothing back,
// so an expired URL would download storage's XML error as <tour>.gpx — hence
// the refresh first, and the refusal to navigate without a usable URL.
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
