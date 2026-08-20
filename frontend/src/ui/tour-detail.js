'use strict';

import * as i18n from '../lib/i18n.js';
import { formatDate, formatDistance } from '../lib/format.js';
import { withUpdatedDate } from '../lib/tours.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { parseErrorMessage } from '../lib/upload.js';
import { state } from './state.js';
import { apiFetch } from './auth.js';
import { toast } from './toast.js';
import { renderAllRoutes, renderRoutes } from './routes.js';
import { renderPins } from './pins.js';
import { renderSidebar, ensureDetail } from './sidebar.js';
import { resetImageSection, renderGallery } from './images.js';
import { refreshMapSize } from './map.js';
import {
  show,
  elMapEmpty,
  elDetailPanel,
  elDetailName,
  elDetailDate,
  elDetailDist,
  elDetailDesc,
  elEditModal,
  elEditName,
  elEditDate,
  elEditDescription,
  elEditError,
  elMapFilterChip,
  elMapFilterChipLabel,
} from './dom.js';
import { openModal, closeModal } from './modal.js';
import { confirmDialog } from './confirm.js';
import { pushLayer, syncUrl } from './router.js';

const t = i18n.t;
const tApi = i18n.tApi;

// The map half of selecting a tour, shared by selectTour and highlightTour so
// a plain tap isn't left on a stale full-map view. Returns null if the
// selection moved on while detail was loading.
export async function focusTourOnMap(tourId) {
  const tour = state.tours.find((t) => t.id === tourId);
  if (!tour) return null;
  await ensureDetail(tour);
  if (state.selectedTourId !== tourId) return null; // user switched while loading
  show(elMapEmpty, false);
  renderRoutes([tour.heatmapData || []], 60);
  renderPins();
  return tour;
}

export async function selectTour(tourId) {
  const tour = state.tours.find((t) => t.id === tourId);
  if (!tour) return;

  state.selectedTourId = tourId;
  renderSidebar();
  renderDetailPanel(tour); // name/meta now; resets the image section
  updateMapFilterChip();
  // Pushed after the URL already reflects the new tour, so Back returns here
  // and closes the panel (#443) — the tour stays selected, matching #442.
  pushLayer(closeDetailPanel);
  const loaded = await focusTourOnMap(tourId);
  if (loaded) renderGallery(loaded);
}

// The panel closes, the selection outlives it: the map is always showing one
// tour with its own photos or every tour with all of them, never a mix.
// updateMapFilterChip() is what tells the user that's still the case —
// otherwise closing the panel leaves the map filtered with no indication (#442).
export function closeDetailPanel() {
  show(elDetailPanel, false);
  refreshMapSize();
  updateMapFilterChip();
}

// A pill over the map, not the sidebar, so the filtered state is visible
// without scrolling — and reachable on mobile once the panel is closed.
export function updateMapFilterChip() {
  const tour = state.tours.find((t) => t.id === state.selectedTourId);
  show(elMapFilterChip, !!tour);
  if (tour) elMapFilterChipLabel.textContent = t('map.filterChipLabel', { name: tour.name });
}

// Ends the selection itself. Every caller renders the all-tours map after,
// which is what keeps the map off a tour that is no longer selected.
export function deselectTour() {
  state.selectedTourId = null;
  closeDetailPanel();
  renderSidebar();
  renderPins();
  syncUrl();
}

export function openEdit() {
  const tour = state.tours.find((t) => t.id === state.selectedTourId);
  if (!tour) return;
  elEditName.value = tour.name || '';
  elEditDate.value = tour.createdAt ? tour.createdAt.slice(0, 10) : '';
  elEditDescription.value = tour.description || '';
  show(elEditError, false);
  openModal(elEditModal);
}

export function closeEdit() {
  closeModal(elEditModal);
}

export async function submitEdit(e) {
  e.preventDefault();
  const id = state.selectedTourId;
  const tour = state.tours.find((t) => t.id === id);
  if (!tour) return;

  show(elEditError, false);
  try {
    const res = await apiFetch(`/api/tours/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: elEditName.value.trim(),
        description: elEditDescription.value.trim(),
        createdAt: withUpdatedDate(tour.createdAt, elEditDate.value),
      }),
    });
    if (!res.ok) {
      elEditError.textContent = tApi(parseErrorMessage(await res.text(), t('errors.saveChanges')));
      show(elEditError, true);
      return;
    }
    const updated = await res.json();
    Object.assign(tour, {
      name: updated.name,
      description: updated.description,
      createdAt: updated.createdAt,
    });
    closeEdit();
    renderSidebar();
    renderDetailPanel(tour);
  } catch {
    elEditError.textContent = t('errors.network');
    show(elEditError, true);
  }
}

// Undo window: the delete is optimistic on the client and the real DELETE
// call is deferred until this elapses, so Undo just cancels the timer and
// puts the tour(s) back — no server-side restore needed.
const DELETE_GRACE_MS = 6000;

// Shared by the single- and bulk-delete flows below. `tours` are the actual
// objects (not just ids) so Undo can restore them without a re-fetch.
function scheduleTourRemoval(tours) {
  const ids = tours.map((tour) => tour.id);
  state.tours = state.tours.filter((tour) => !ids.includes(tour.id));
  ids.forEach((id) => state.selectedIds.delete(id));
  if (ids.includes(state.selectedTourId)) deselectTour();
  state.selectMode = false;
  renderSidebar();
  renderAllRoutes();

  let undone = false;
  const timer = setTimeout(async () => {
    const succeeded = [];
    const failed = [];
    await runWithConcurrency(ids, 3, async (id) => {
      try {
        const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('delete failed');
        succeeded.push(id);
      } catch {
        failed.push(id);
      }
    });
    if (failed.length === 0) return;
    // A failed background delete must not leave the tour missing from the UI.
    state.tours.push(...tours.filter((tour) => failed.includes(tour.id)));
    renderSidebar();
    await renderAllRoutes();
    toast(
      succeeded.length === 0
        ? t('toast.tourDeleteError')
        : t('toast.toursDeletedPartial', { deleted: succeeded.length, total: ids.length }),
      'error',
    );
  }, DELETE_GRACE_MS);

  toast(
    ids.length === 1 ? t('toast.tourDeleted') : t('toast.toursDeleted', { count: ids.length }),
    'success',
    DELETE_GRACE_MS,
    {
      label: t('toast.undo'),
      onClick: () => {
        if (undone) return;
        undone = true;
        clearTimeout(timer);
        state.tours.push(...tours);
        renderSidebar();
        renderAllRoutes();
      },
    },
  );
}

export async function deleteTourById(id) {
  const tour = state.tours.find((t) => t.id === id);
  if (!tour) return;
  const ok = await confirmDialog({
    title: t('confirm.deleteTourTitle'),
    message: t('confirm.deleteTourMessage', { name: tour.name || '' }),
    confirmLabel: t('common.delete'),
  });
  if (!ok) return;
  scheduleTourRemoval([tour]);
}

export async function deleteSelectedTour() {
  if (!state.selectedTourId) return;
  await deleteTourById(state.selectedTourId);
}

export async function deleteSelectedTours() {
  if (state.selectedIds.size === 0) return;
  const tours = state.tours.filter((tour) => state.selectedIds.has(tour.id));
  const ok = await confirmDialog({
    title: t('confirm.deleteToursTitle'),
    message: t('confirm.deleteToursMessage', { count: tours.length }),
    confirmLabel: t('common.delete'),
  });
  if (!ok) return;
  scheduleTourRemoval(tours);
}

function renderDetailPanel(tour) {
  elDetailName.textContent = tour.name;
  elDetailDate.textContent = formatDate(tour.createdAt, i18n.dateLocale());
  elDetailDist.textContent = formatDistance(tour.distance);
  elDetailDesc.textContent = tour.description || '';
  resetImageSection();
  show(elDetailPanel, true);
  refreshMapSize();
}

// A navigation, not a fetch: the blob is cross-origin and its filename comes
// from the signed URL's Content-Disposition. Navigations report nothing back,
// so an expired URL would download storage's XML error as <tour>.gpx — hence
// the refresh first, and the refusal to navigate without a usable URL.
export async function downloadSelectedGpx() {
  const tour = state.tours.find((t) => t.id === state.selectedTourId);
  if (!tour) return;
  await ensureDetail(tour);
  if (!tour.gpxFileUrl) {
    toast(t('toast.gpxDownloadError'), 'error');
    return;
  }
  const a = document.createElement('a');
  a.href = tour.gpxFileUrl;
  a.click();
}
