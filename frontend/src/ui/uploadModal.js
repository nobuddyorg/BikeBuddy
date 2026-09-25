import * as i18n from './i18n.js';
import { defaultTourName, validateGpxUpload } from '../lib/files.js';
import { buildUploadQuery } from '../lib/upload.js';
import { xhrUpload } from './uploadRequest.js';
import { state } from './state.js';
import { getAccessToken, API_BASE } from './api.js';
import { toast } from './toast.js';
import { loadTours } from './sidebar.js';
import { selectTour } from './tourPanel.js';
import { openModal, closeModal } from './modal.js';
import {
  showElement,
  hideElement,
  uploadModal,
  uploadForm,
  uploadNameInput,
  uploadDescriptionInput,
  gpxDropzone,
  gpxDropzoneFilename,
  uploadProgress,
  uploadProgressBar,
  uploadError,
  submitUploadButton,
} from './dom.js';

const t = i18n.t;

// Holds the one GPX file chosen for the upload, once it passed the checks.
let selectedFiles = [];

function resetUploadForm() {
  selectedFiles = [];
  uploadForm.reset();
  hideElement(gpxDropzoneFilename);
  hideElement(uploadProgress);
  hideElement(uploadError);
  uploadProgressBar.style.width = '0%';
  gpxDropzone.classList.remove('dragover');
  submitUploadButton.disabled = true;
}

export function openUpload() {
  if (!state.user) return;
  resetUploadForm();
  openModal(uploadModal);
}

export function closeUpload() {
  closeModal(uploadModal);
}

function showUploadError(message) {
  uploadError.textContent = message;
  showElement(uploadError);
}

export function selectFile(file) {
  hideElement(uploadError);
  if (!file) return;
  const [problem] = validateGpxUpload(file);
  if (problem) {
    showUploadError(t(problem.key, problem.params));
    return;
  }
  selectedFiles = [file];
  gpxDropzoneFilename.textContent = file.name;
  showElement(gpxDropzoneFilename);
  submitUploadButton.disabled = false;
  if (!uploadNameInput.value) uploadNameInput.value = defaultTourName(file.name);
}

function showUploadFailure(message) {
  showUploadError(message);
  hideElement(uploadProgress);
  submitUploadButton.disabled = false;
}

export async function submitUpload(event) {
  event.preventDefault();
  const [file] = selectedFiles;
  if (!file) return;

  const query = buildUploadQuery({
    name: uploadNameInput.value,
    description: uploadDescriptionInput.value,
  });
  const token = await getAccessToken();
  submitUploadButton.disabled = true;
  hideElement(uploadError);
  showElement(uploadProgress);
  uploadProgressBar.style.width = '0%';

  let created;
  try {
    created = await xhrUpload({
      url: `${API_BASE}/api/tours/upload?${query}`,
      file,
      token,
      onProgress: (percent) => {
        uploadProgressBar.style.width = `${percent}%`;
      },
    });
  } catch (error) {
    showUploadFailure(i18n.tApi(error.message));
    return;
  }
  // Past this point the tour exists: nothing below may offer the upload again.
  closeUpload();
  toast(t('toast.tourUploaded'), { type: 'success' });
  await loadTours();
  await selectTour(created.tourId);
}
