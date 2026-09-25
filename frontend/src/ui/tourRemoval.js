import * as i18n from './i18n.js';
import { deletionFailureMessage, removeToursById } from '../lib/tours.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { state } from './state.js';
import { apiFetch } from './api.js';
import { toast } from './toast.js';
import { renderAllRoutes } from './routes.js';
import { closeDetailPanel } from './tourPanel.js';
import { confirmDialog } from './confirm.js';
import { scheduleUndoable } from './undoableAction.js';
import { announce, TOURS_CHANGED } from './events.js';

const t = i18n.t;

const DELETE_CONCURRENCY = 3;

function showTours() {
  announce(TOURS_CHANGED);
  return renderAllRoutes();
}

async function deleteTourOnServer(tour) {
  const response = await apiFetch(`/api/tours/${tour.id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`DELETE /api/tours/${tour.id} answered ${response.status}`);
}

async function deleteOnServer(tours) {
  const outcomes = await runWithConcurrency({
    items: tours,
    limit: DELETE_CONCURRENCY,
    worker: deleteTourOnServer,
  });
  const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
  if (failures.length === 0) return;
  failures.forEach((failure) => console.error(failure.reason));
  // A failed background delete must not leave the tour missing from the UI.
  state.tours.push(...failures.map((failure) => failure.item));
  await showTours();
  const message = deletionFailureMessage({
    succeededCount: tours.length - failures.length,
    totalCount: tours.length,
  });
  toast(t(message.key, message.params), { type: 'error' });
}

// `tours` are the objects themselves, not ids, so Undo can put them back
// without a re-fetch.
function scheduleTourRemoval(tours) {
  const ids = tours.map((tour) => tour.id);
  state.tours = removeToursById(state.tours, ids);
  ids.forEach((id) => state.selectedIds.delete(id));
  if (ids.includes(state.selectedTourId)) closeDetailPanel();
  state.selectMode = false;
  showTours();

  scheduleUndoable({
    message: t('toast.toursDeleted', { count: ids.length }),
    commit: () => deleteOnServer(tours),
    revert: () => {
      state.tours.push(...tours);
      showTours();
    },
  });
}

async function confirmTourRemoval({ title, message, tours }) {
  const confirmed = await confirmDialog({
    title,
    message,
    confirmLabel: t('common.delete'),
  });
  if (confirmed) scheduleTourRemoval(tours);
}

export async function deleteTourById(tourId) {
  const tour = state.tours.find((candidate) => candidate.id === tourId);
  if (!tour) return;
  await confirmTourRemoval({
    title: t('confirm.deleteTourTitle'),
    message: t('confirm.deleteTourMessage', { name: tour.name || '' }),
    tours: [tour],
  });
}

export async function deleteSelectedTour() {
  if (!state.selectedTourId) return;
  await deleteTourById(state.selectedTourId);
}

export async function deleteSelectedTours() {
  if (state.selectedIds.size === 0) return;
  const tours = state.tours.filter((tour) => state.selectedIds.has(tour.id));
  await confirmTourRemoval({
    title: t('confirm.deleteToursTitle'),
    message: t('confirm.deleteToursMessage', { count: tours.length }),
    tours,
  });
}
