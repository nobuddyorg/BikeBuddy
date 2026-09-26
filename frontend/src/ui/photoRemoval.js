import { withImageRestored, withoutImage } from '../lib/images.js';
import { isDeleted } from '../lib/tours.js';
import * as i18n from './i18n.js';
import { state } from './state.js';
import { apiFetch } from './api.js';
import { confirmDialog } from './confirm.js';
import { toast } from './toast.js';
import { scheduleUndoable } from './undoableAction.js';
import { announce, GALLERY_CHANGED, PHOTO_LOCATIONS_CHANGED } from './events.js';

const t = i18n.t;

export async function confirmDeletePhoto() {
  return confirmDialog({
    title: t('confirm.deletePhotoTitle'),
    message: t('confirm.deletePhotoMessage'),
    confirmLabel: t('common.delete'),
  });
}

// Callers remove the tile or advance the lightbox themselves; this only updates the data.
export function scheduleImageRemoval(image, tourId) {
  const tour = state.tours.find((candidate) => candidate.id === tourId);
  if (tour?.images) tour.images = withoutImage(tour.images, image.id);
  announce(PHOTO_LOCATIONS_CHANGED);

  const restore = () => {
    if (tour?.images) tour.images = withImageRestored(tour.images, image);
    if (tour?.id === state.selectedTourId) announce(GALLERY_CHANGED);
    announce(PHOTO_LOCATIONS_CHANGED);
  };

  scheduleUndoable({
    message: t('toast.photoDeleted'),
    revert: restore,
    commit: async () => {
      try {
        const response = await apiFetch(`/api/v1/tours/${tourId}/images/${image.id}`, {
          method: 'DELETE',
          keepalive: true,
        });
        if (!isDeleted(response)) throw new Error('delete failed');
      } catch {
        restore();
        toast(t('toast.photoDeleteError'), { type: 'error' });
      }
    },
  });
}

export async function deleteGalleryPhoto(image, tile) {
  const confirmed = await confirmDeletePhoto();
  if (!confirmed) return;
  tile.remove();
  scheduleImageRemoval(image, state.selectedTourId);
}
