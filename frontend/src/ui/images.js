'use strict';

import * as i18n from '../lib/i18n.js';
import { validateImageUpload, validateImageBatch, validateImageQuota } from '../lib/files.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { xhrUpload } from '../lib/upload.js';
import { state } from './state.js';
import {
  show,
  elImageGrid,
  elImageError,
  elImageDropzone,
  elLightbox,
  elLightboxStage,
  elLightboxImg,
  elLightboxError,
  elLightboxCounter,
  elLightboxNavbar,
  elBtnLightboxDelete,
} from './dom.js';
import { apiFetch, getAccessToken, API_BASE } from './auth.js';
import { renderPins } from './pins.js';
import { openModal, closeModal } from './modal.js';
import { confirmDialog } from './confirm.js';
import { toast } from './toast.js';
import { ensureDetail } from './sidebar.js';

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
  // thumbUrl is missing only for a tour whose detail predates #466's
  // real-thumbnail backfill and hasn't been migrated yet — fall back to the
  // full image rather than showing nothing.
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
  // A SAS URL expires in the background (see sasCache.js) — the tile that
  // was a fine thumbnail a moment ago can start failing without a re-render.
  img.addEventListener('error', () => {
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
    deleteImage(image.id, fig);
  });

  fig.append(img, del);
  return fig;
}

// Shared by the upload-pending tile and the broken-thumbnail state above -
// same error/retry/dismiss layout, different message and retry action.
function renderErrorTile(fig, message, { retryable, retryAria, onRetry, onDismiss }) {
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

// Forces a fresh signature rather than retrying the dead URL (see sasCache.js)
// and re-renders every tile, since one expired SAS URL means they all are.
async function retryTourImages() {
  const tour = state.tours.find((t) => t.id === state.selectedTourId);
  if (!tour) return null;
  tour.fetchedAt = 0;
  await ensureDetail(tour);
  if (state.selectedTourId !== tour.id) return null; // user navigated away while refetching
  renderGallery(tour);
  return tour;
}

// One in-flight upload: pending (progress ring) → error (retry/dismiss) or done
// (swapped for the markup createImageTile produces).
function createPendingImageTile(file) {
  const fig = document.createElement('figure');
  fig.className = 'image-tile image-tile-pending';
  fig.dataset.testid = 'image-tile-pending';

  const ring = document.createElement('div');
  ring.className = 'image-progress-ring';
  ring.style.setProperty('--progress', '0');

  const name = document.createElement('p');
  name.className = 'image-tile-filename';
  name.textContent = file.name;

  fig.append(ring, name);

  const tile = {
    el: fig,
    onRetry: null,
    setProgress(percent) {
      ring.style.setProperty('--progress', String(percent));
    },
    reset() {
      fig.className = 'image-tile image-tile-pending';
      fig.dataset.testid = 'image-tile-pending';
      fig.innerHTML = '';
      ring.style.setProperty('--progress', '0');
      fig.append(ring, name);
    },
    setError(message, retryable) {
      renderErrorTile(fig, message, {
        retryable,
        retryAria: t('detail.retryPhotoAria'),
        onRetry: () => tile.onRetry && tile.onRetry(),
        onDismiss: () => fig.remove(),
      });
    },
    setDone(image) {
      fig.replaceWith(createImageTile(image));
    },
  };
  return tile;
}

export function renderGallery(tour) {
  elImageGrid.innerHTML = '';
  (tour.images || []).forEach((image) => elImageGrid.appendChild(createImageTile(image)));
}

// Each entry is { id, url, tourId } — tourId is what lets the lightbox
// delete a photo without assuming it belongs to state.selectedTourId (a map
// pin opened with no tour selected can show photos from several tours).
let lightboxImages = [];
let lightboxIndex = 0;

function currentLightboxImage() {
  return lightboxImages[lightboxIndex];
}

function renderLightbox() {
  const image = currentLightboxImage();
  if (!image) return;
  show(elLightboxError, false);
  show(elLightboxImg, true);
  elLightboxImg.src = image.url;
  elLightboxCounter.textContent = t('lightbox.counter', {
    current: lightboxIndex + 1,
    total: lightboxImages.length,
  });
  show(elLightboxNavbar, lightboxImages.length > 1);
  show(elBtnLightboxDelete, !!image.tourId);
}

// A SAS URL can expire while the lightbox sits open on it (see sasCache.js) -
// swap in the error state rather than leaving a blank/broken image.
elLightboxImg.addEventListener('error', () => {
  show(elLightboxImg, false);
  show(elLightboxError, true);
});

// Swipe (touch only, like bindTourSwipe in sidebar.js): a horizontal drag
// past the threshold navigates instead of the vertical/pinch gestures the
// browser already owns elsewhere. suppressNextClick stops the swipe's own
// trailing synthetic click from being read as "tap the photo to close".
const LIGHTBOX_SWIPE_THRESHOLD_PX = 50;
let swipeStart = null;
let swiping = false;
let suppressNextClick = false;

elLightboxStage.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  swipeStart = { x: e.clientX, y: e.clientY };
  swiping = false;
});

elLightboxStage.addEventListener('pointermove', (e) => {
  if (!swipeStart) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  if (!swiping && Math.abs(dy) > Math.abs(dx)) {
    swipeStart = null; // vertical drag — not a swipe we own
    return;
  }
  swiping = true;
});

elLightboxStage.addEventListener('pointerup', (e) => {
  if (!swiping) {
    swipeStart = null;
    return;
  }
  const dx = e.clientX - swipeStart.x;
  swipeStart = null;
  swiping = false;
  if (Math.abs(dx) < LIGHTBOX_SWIPE_THRESHOLD_PX) return;
  suppressNextClick = true;
  setTimeout(() => {
    suppressNextClick = false;
  }, 400);
  if (dx > 0) lightboxPrev();
  else lightboxNext();
});

// Tap-the-photo-to-close (#466): wireModalClose only closes on a click that
// lands on the overlay itself, which stopped covering the image once the
// lightbox became a real focus-trapped modal with prev/next controls.
elLightboxImg.addEventListener('click', () => {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  closeLightbox();
});

export function openLightbox(images, index) {
  lightboxImages = images;
  lightboxIndex = index;
  renderLightbox();
  openModal(elLightbox, closeLightbox);
}

export function lightboxPrev() {
  if (lightboxImages.length === 0) return;
  lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
  renderLightbox();
}

export function lightboxNext() {
  if (lightboxImages.length === 0) return;
  lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
  renderLightbox();
}

export function closeLightbox() {
  closeModal(elLightbox);
  elLightboxImg.src = '';
  lightboxImages = [];
}

export async function retryLightboxImage() {
  const tour = await retryTourImages();
  if (!tour) return;
  lightboxImages = (tour.images || []).map((i) => ({ ...i, tourId: tour.id }));
  if (lightboxIndex >= lightboxImages.length) lightboxIndex = Math.max(lightboxImages.length - 1, 0);
  renderLightbox();
}

// Shared by the gallery tile's delete button and the lightbox's: confirms,
// deletes via the API, and updates the in-memory tour. Returns null if the
// user cancelled, otherwise whether the delete succeeded — kept distinct so
// callers don't treat a cancel as a failure worth surfacing.
async function deletePhoto(imageId, tourId) {
  const ok = await confirmDialog({
    title: t('confirm.deletePhotoTitle'),
    message: t('confirm.deletePhotoMessage'),
    confirmLabel: t('common.delete'),
  });
  if (!ok) return null;
  try {
    const res = await apiFetch(`/api/tours/${tourId}/images/${imageId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    const tour = state.tours.find((t) => t.id === tourId);
    if (tour?.images) tour.images = tour.images.filter((i) => i.id !== imageId);
    return true;
  } catch {
    return false;
  }
}

async function deleteImage(imageId, tileEl) {
  const result = await deletePhoto(imageId, state.selectedTourId);
  if (result === true) tileEl.remove();
  else if (result === false) showImageError(t('toast.photoDeleteError'));
}

// Deletes the photo currently shown, then clamps the index into whatever
// remains — no special-casing needed as the array shrinks.
async function deleteCurrentLightboxPhoto() {
  const image = currentLightboxImage();
  if (!image) return;
  const result = await deletePhoto(image.id, image.tourId);
  if (result === false) {
    toast(t('toast.photoDeleteError'), 'error');
    return;
  }
  if (result !== true) return; // cancelled

  lightboxImages.splice(lightboxIndex, 1);
  renderPins();
  const tour = state.tours.find((t) => t.id === image.tourId);
  if (tour && tour.id === state.selectedTourId) renderGallery(tour);

  if (lightboxImages.length === 0) {
    closeLightbox();
    return;
  }
  lightboxIndex = Math.min(lightboxIndex, lightboxImages.length - 1);
  renderLightbox();
}

elBtnLightboxDelete.addEventListener('click', deleteCurrentLightboxPhoto);

function showImageError(message) {
  elImageError.textContent = message;
  show(elImageError, true);
}

// One request per file against the single-image endpoint, 3 in flight at once.
export async function uploadImages(files) {
  show(elImageError, false);
  const tourId = state.selectedTourId;
  if (!tourId || files.length === 0) return;

  const batchError = validateImageBatch(files);
  if (batchError) {
    showImageError(t(batchError));
    return;
  }

  const token = await getAccessToken();
  const tour = state.tours.find((t) => t.id === tourId);
  let imageCount = tour?.images?.length || 0;
  const jobs = [];
  for (const file of files) {
    const tile = createPendingImageTile(file);
    elImageGrid.appendChild(tile.el);

    const quotaError = validateImageQuota(imageCount);
    if (quotaError) {
      tile.setError(t(quotaError), false);
      continue;
    }

    const fileError = validateImageUpload(file);
    if (fileError) {
      tile.setError(t(fileError), false);
      continue;
    }
    imageCount++;
    jobs.push({ file, tile });
  }

  const uploadOne = async (job) => {
    job.tile.reset();
    try {
      const image = await xhrUpload(
        `${API_BASE}/api/tours/${tourId}/images`,
        job.file,
        token,
        job.tile.setProgress,
      );
      if (tour) tour.images = [...(tour.images || []), image];
      job.tile.setDone(image);
      renderPins(); // a newly uploaded geotagged photo may add a marker
    } catch (err) {
      job.tile.setError(err.message, true);
    }
  };
  jobs.forEach((job) => {
    job.tile.onRetry = () => uploadOne(job);
  });

  await runWithConcurrency(jobs, 3, uploadOne);
}
