import { ensureDetail as loadDetail } from '../lib/tourDetail.js';
import { markStale } from '../lib/sasCache.js';
import { state } from './state.js';
import { apiFetch } from './api.js';
import * as i18n from './i18n.js';
import { toast } from './toast.js';

// Resolves to whether the tour's detail is current; on a failure the tour
// still has empty track and photo lists, and the caller tells the user.
export async function ensureDetail(tour) {
  try {
    await loadDetail({ apiFetch, tour, now: Date.now() });
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// Forces a fresh signature rather than retrying the dead URL (see sasCache.js),
// since one expired SAS URL means they all are. Resolves to the selected tour,
// or to nothing when the selection moved on while refetching.
export async function refreshSelectedTourImages() {
  const tour = state.tours.find((candidate) => candidate.id === state.selectedTourId);
  if (!tour) return undefined;
  markStale(tour);
  const loaded = await ensureDetail(tour);
  if (state.selectedTourId !== tour.id) return undefined;
  if (!loaded) toast(i18n.t('toast.tourDetailError'), { type: 'error' });
  return tour;
}
