import * as i18n from './i18n.js';
import { state } from './state.js';
import { show, elImageGrid, elImageError, elImageDropzone } from './dom.js';
import { openLightbox } from './lightbox.js';
import { deleteGalleryPhoto } from './photoRemoval.js';
import { refreshSelectedTourImages } from './tourData.js';

const t = i18n.t;

export function resetImageSection() {
  elImageGrid.innerHTML = '';
  show(elImageError, false);
  elImageDropzone.classList.remove('dragover');
}

export function createImageTile(image) {
  const fig = document.createElement('figure');
  fig.className = 'image-tile';

  const img = document.createElement('img');
  img.className = 'image-thumb';
  img.src = image.thumbUrl || image.url;
  img.alt = t('lightbox.imgAlt');
  img.loading = 'lazy';
  // Skeleton shimmer (style.css) until the photo has actually loaded.
  img.addEventListener('load', () => img.classList.add('is-loaded'));
  img.addEventListener('click', () => {
    const tour = state.tours.find((t) => t.id === state.selectedTourId);
    const images = (tour?.images || []).map((i) => ({ ...i, tourId: tour.id }));
    const index = images.findIndex((i) => i.id === image.id);
    openLightbox(images, index < 0 ? 0 : index);
  });
  // thumbUrl is always a signed URL even for photos that predate #466's
  // real-thumbnail work and have no thumb blob yet — SAS signing doesn't
  // check blob existence, so it 404s rather than coming back empty. Fall
  // back to the full image once before treating it as a real load failure
  // (a SAS URL expiring in the background per sasCache.js is the other
  // reason this fires).
  let triedFullImage = !image.thumbUrl;
  img.addEventListener('error', () => {
    if (!triedFullImage) {
      triedFullImage = true;
      img.src = image.url;
      return;
    }
    renderErrorTile(fig, t('detail.photoLoadError'), {
      retryable: true,
      retryAria: t('detail.retryLoadAria'),
      onRetry: () => retryTourImages(),
      onDismiss: () => fig.remove(),
    });
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'image-delete';
  del.setAttribute('aria-label', t('detail.deletePhotoAria'));
  del.textContent = '✕';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteGalleryPhoto(image, fig);
  });

  fig.append(img, del);
  return fig;
}

// Shared by the upload-pending tile and the broken-thumbnail state above -
// same error/retry/dismiss layout, different message and retry action.
export function renderErrorTile(fig, message, { retryable, retryAria, onRetry, onDismiss }) {
  fig.className = 'image-tile image-tile-error';
  fig.dataset.testid = 'image-tile-error';
  fig.innerHTML = '';

  const msg = document.createElement('p');
  msg.className = 'image-tile-error-message';
  msg.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'image-tile-actions';

  if (retryable) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'image-tile-retry';
    retry.dataset.testid = 'image-tile-retry';
    retry.setAttribute('aria-label', retryAria);
    retry.textContent = '↻';
    retry.addEventListener('click', onRetry);
    actions.append(retry);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'image-tile-dismiss';
  dismiss.dataset.testid = 'image-tile-dismiss';
  dismiss.setAttribute('aria-label', t('detail.dismissPhotoAria'));
  dismiss.textContent = '✕';
  dismiss.addEventListener('click', onDismiss);
  actions.append(dismiss);

  fig.append(msg, actions);
}

// Re-renders every tile, since one expired SAS URL means they all are.
async function retryTourImages() {
  const tour = await refreshSelectedTourImages();
  if (tour) renderGallery(tour);
}

export function renderGallery(tour) {
  elImageGrid.innerHTML = '';
  (tour.images || []).forEach((image) => elImageGrid.appendChild(createImageTile(image)));
}
