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
} from './dom.js';
import { openModal, closeModal } from './modal.js';

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
  const loaded = await focusTourOnMap(tourId);
  if (loaded) renderGallery(loaded);
}

// The panel closes, the selection outlives it: the map is always showing one
// tour with its own photos or every tour with all of them, never a mix.
export function closeDetailPanel() {
  show(elDetailPanel, false);
  refreshMapSize();
}

// Ends the selection itself. Every caller renders the all-tours map after,
// which is what keeps the map off a tour that is no longer selected.
export function deselectTour() {
  state.selectedTourId = null;
  closeDetailPanel();
  renderSidebar();
  renderPins();
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

export async function deleteTourById(id) {
  if (!confirm(t('confirm.deleteTour'))) return;
  try {
    const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    state.tours = state.tours.filter((t) => t.id !== id);
    if (id === state.selectedTourId) deselectTour();
    renderSidebar();
    await renderAllRoutes();
    toast(t('toast.tourDeleted'), 'success');
  } catch {
    toast(t('toast.tourDeleteError'), 'error');
  }
}

export async function deleteSelectedTour() {
  if (!state.selectedTourId) return;
  await deleteTourById(state.selectedTourId);
}

export async function deleteSelectedTours() {
  if (state.selectedIds.size === 0) return;
  if (!confirm(t('confirm.deleteTours'))) return;

  const ids = [...state.selectedIds];
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

  state.tours = state.tours.filter((tour) => !succeeded.includes(tour.id));
  succeeded.forEach((id) => state.selectedIds.delete(id));
  if (succeeded.includes(state.selectedTourId)) {
    deselectTour();
  }

  if (failed.length === 0) {
    state.selectMode = false;
    toast(
      succeeded.length === 1
        ? t('toast.tourDeleted')
        : t('toast.toursDeleted', { count: succeeded.length }),
      'success',
    );
  } else if (succeeded.length === 0) {
    toast(t('toast.tourDeleteError'), 'error');
  } else {
    toast(
      t('toast.toursDeletedPartial', {
        deleted: succeeded.length,
        total: ids.length,
      }),
      'error',
    );
  }

  renderSidebar();
  await renderAllRoutes();
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
