import * as i18n from './i18n.js';
import { planImageUploads, validateImageBatch } from '../lib/files.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { xhrUpload } from './uploadRequest.js';
import { state } from './state.js';
import { showElement, hideElement, imageGrid, imageError } from './dom.js';
import { getAccessToken, API_BASE } from './api.js';
import { renderPins } from './pins.js';
import { createImageTile, renderErrorTile, renderRetryableErrorTile } from './gallery.js';

const t = i18n.t;

const UPLOAD_CONCURRENCY = 3;
const UNREADABLE_RESPONSE = 'errors.uploadUnreadable';

function createPendingImageTile({ file, onRetry }) {
  const tile = document.createElement('figure');
  const ring = document.createElement('div');
  ring.className = 'image-progress-ring';
  const fileName = document.createElement('p');
  fileName.className = 'image-tile-filename';
  fileName.textContent = file.name;

  const showPending = () => {
    tile.className = 'image-tile image-tile-pending';
    tile.dataset.testid = 'image-tile-pending';
    ring.style.setProperty('--progress', '0');
    tile.replaceChildren(ring, fileName);
  };
  showPending();

  return {
    element: tile,
    showPending,
    setProgress: (percent) => ring.style.setProperty('--progress', String(percent)),
    setError: (message) => renderErrorTile({ tile, message }),
    setRetryableError: (message) =>
      renderRetryableErrorTile({ tile, message, retryLabel: t('detail.retryPhotoAria'), onRetry }),
    setDone: (image) => tile.replaceWith(createImageTile(image)),
  };
}

function showImageError(message) {
  imageError.textContent = message;
  showElement(imageError);
}

async function uploadOne({ job, tour }) {
  job.tile.showPending();
  try {
    // Per attempt: a retry minutes later must not reuse an expired token.
    const token = await getAccessToken();
    const image = await xhrUpload({
      url: `${API_BASE}/api/v1/tours/${tour.id}/images`,
      file: job.file,
      token,
      onProgress: job.tile.setProgress,
    });
    tour.images = [...(tour.images || []), image];
    job.tile.setDone(image);
    renderPins(); // a geotagged photo adds a marker
  } catch (error) {
    // The photo was stored; a retry would upload it a second time.
    if (error.message === UNREADABLE_RESPONSE) job.tile.setError(t(UNREADABLE_RESPONSE));
    else job.tile.setRetryableError(i18n.tApi(error.message));
  }
}

function queueUploads({ files, tour }) {
  const jobs = [];
  for (const { file, problems } of planImageUploads({
    files,
    existingCount: tour.images?.length || 0,
  })) {
    const job = { file };
    job.tile = createPendingImageTile({ file, onRetry: () => uploadOne({ job, tour }) });
    imageGrid.appendChild(job.tile.element);
    const [problem] = problems;
    if (problem) job.tile.setError(t(problem.key, problem.params));
    else jobs.push(job);
  }
  return jobs;
}

export async function uploadImages(files) {
  hideElement(imageError);
  const tourId = state.selectedTourId;
  if (!tourId || files.length === 0) return;
  // The gallery renders once the detail loads; tiles added before then would be wiped.
  await state.detailLoading;
  const tour = state.tours.find((candidate) => candidate.id === tourId);
  if (state.selectedTourId !== tourId || !tour) return;

  const [batchProblem] = validateImageBatch(files);
  if (batchProblem) {
    showImageError(t(batchProblem.key, batchProblem.params));
    return;
  }

  const jobs = queueUploads({ files, tour });
  await runWithConcurrency({
    items: jobs,
    limit: UPLOAD_CONCURRENCY,
    worker: (job) => uploadOne({ job, tour }),
  });
}
