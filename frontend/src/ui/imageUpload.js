import * as i18n from './i18n.js';
import { validateImageUpload, validateImageBatch, validateImageQuota } from '../lib/files.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { xhrUpload } from './uploadRequest.js';
import { state } from './state.js';
import { show, elImageGrid, elImageError } from './dom.js';
import { getAccessToken, API_BASE } from './api.js';
import { renderPins } from './pins.js';
import { createImageTile, renderErrorTile } from './gallery.js';

const t = i18n.t;

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

function showImageError(message) {
  elImageError.textContent = message;
  show(elImageError, true);
}

// One request per file against the single-image endpoint, 3 in flight at once.
export async function uploadImages(files) {
  show(elImageError, false);
  const tourId = state.selectedTourId;
  if (!tourId || files.length === 0) return;
  // The panel shows the tour's name before its detail (and gallery) has loaded;
  // tiles added before that render would be wiped by it.
  await state.detailLoading;
  if (state.selectedTourId !== tourId) return;

  const [batchProblem] = validateImageBatch(files);
  if (batchProblem) {
    showImageError(t(batchProblem.key, batchProblem.params));
    return;
  }

  const token = await getAccessToken();
  const tour = state.tours.find((t) => t.id === tourId);
  let imageCount = tour?.images?.length || 0;
  const jobs = [];
  for (const file of files) {
    const tile = createPendingImageTile(file);
    elImageGrid.appendChild(tile.el);

    const [problem] = [...validateImageQuota(imageCount), ...validateImageUpload(file)];
    if (problem) {
      tile.setError(t(problem.key, problem.params), false);
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
      job.tile.setError(i18n.tApi(err.message), true);
    }
  };
  jobs.forEach((job) => {
    job.tile.onRetry = () => uploadOne(job);
  });

  await runWithConcurrency(jobs, 3, uploadOne);
}
