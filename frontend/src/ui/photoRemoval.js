import * as i18n from './i18n.js';
import { state } from './state.js';
import { apiFetch } from './api.js';
import { confirmDialog } from './confirm.js';
import { toast } from './toast.js';
import { announce, GALLERY_CHANGED, PHOTO_LOCATIONS_CHANGED } from './events.js';

const t = i18n.t;

const PHOTO_DELETE_GRACE_MS = 6000;

export async function confirmDeletePhoto() {
  return confirmDialog({
    title: t('confirm.deletePhotoTitle'),
    message: t('confirm.deletePhotoMessage'),
    confirmLabel: t('common.delete'),
  });
}

// Mirrors tour-detail.js's scheduleTourRemoval: the real DELETE call is
// deferred until the grace window elapses, so Undo just cancels the timer
// and puts the photo back — no server-side restore needed. Only touches
// tour.images and the gallery/pins; callers own the UI they deleted from
// (gallery tile removal, or advancing the lightbox) since a photo can be
// deleted from either.
export function scheduleImageRemoval(image, tourId) {
  const tour = state.tours.find((t) => t.id === tourId);
  if (tour?.images) tour.images = tour.images.filter((i) => i.id !== image.id);
  announce(PHOTO_LOCATIONS_CHANGED);

  const restore = () => {
    if (tour?.images && !tour.images.some((i) => i.id === image.id)) tour.images.push(image);
    if (tour?.id === state.selectedTourId) announce(GALLERY_CHANGED);
    announce(PHOTO_LOCATIONS_CHANGED);
  };

  let undone = false;
  const timer = setTimeout(async () => {
    try {
      const res = await apiFetch(`/api/tours/${tourId}/images/${image.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete failed');
    } catch {
      // A failed background delete must not leave the photo missing from the UI.
      restore();
      toast(t('toast.photoDeleteError'), 'error');
    }
  }, PHOTO_DELETE_GRACE_MS);

  toast(t('toast.photoDeleted'), 'success', PHOTO_DELETE_GRACE_MS, {
    label: t('toast.undo'),
    onClick: () => {
      if (undone) return;
      undone = true;
      clearTimeout(timer);
      restore();
    },
  });
}

export async function deleteGalleryPhoto(image, tileEl) {
  const ok = await confirmDeletePhoto();
  if (!ok) return;
  tileEl.remove();
  scheduleImageRemoval(image, state.selectedTourId);
}
