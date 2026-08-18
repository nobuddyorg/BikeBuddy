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
  elLightboxImg,
} from './dom.js';
import { apiFetch, getAccessToken, API_BASE } from './auth.js';
import { renderPins } from './pins.js';

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
  img.src = image.url;
  img.alt = t('lightbox.imgAlt');
  img.loading = 'lazy';
  img.addEventListener('click', () => openLightbox(image.url));

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
        retry.setAttribute('aria-label', t('detail.retryPhotoAria'));
        retry.textContent = '↻';
        retry.addEventListener('click', () => tile.onRetry && tile.onRetry());
        actions.append(retry);
      }

      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'image-tile-dismiss';
      dismiss.dataset.testid = 'image-tile-dismiss';
      dismiss.setAttribute('aria-label', t('detail.dismissPhotoAria'));
      dismiss.textContent = '✕';
      dismiss.addEventListener('click', () => fig.remove());
      actions.append(dismiss);

      fig.append(msg, actions);
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

export function openLightbox(url) {
  elLightboxImg.src = url;
  show(elLightbox, true);
}

export function closeLightbox() {
  show(elLightbox, false);
  elLightboxImg.src = '';
}

async function deleteImage(imageId, tileEl) {
  if (!confirm(t('confirm.deletePhoto'))) return;
  const tourId = state.selectedTourId;
  try {
    const res = await apiFetch(`/api/tours/${tourId}/images/${imageId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    tileEl.remove();
    const tour = state.tours.find((t) => t.id === tourId);
    if (tour?.images) tour.images = tour.images.filter((i) => i.id !== imageId);
  } catch {
    showImageError(t('toast.photoDeleteError'));
  }
}

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
