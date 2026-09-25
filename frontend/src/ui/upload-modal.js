import * as i18n from './i18n.js';
import { defaultTourName, validateGpxUpload } from '../lib/files.js';
import { buildUploadQuery } from '../lib/upload.js';
import { xhrUpload } from './uploadRequest.js';
import { state } from './state.js';
import { getAccessToken, API_BASE } from './api.js';
import { toast } from './toast.js';
import { loadTours } from './sidebar.js';
import { selectTour } from './tour-detail.js';
import { openModal, closeModal } from './modal.js';
import {
  show,
  elUploadModal,
  elUploadForm,
  elUploadName,
  elUploadDescription,
  elDropzone,
  elDropzoneFilename,
  elUploadProgress,
  elUploadProgressBar,
  elUploadError,
  elBtnSubmitUpload,
} from './dom.js';

const t = i18n.t;
const tApi = i18n.tApi;

let selectedFile = null;

function resetUploadForm() {
  selectedFile = null;
  elUploadForm.reset();
  show(elDropzoneFilename, false);
  show(elUploadProgress, false);
  show(elUploadError, false);
  elUploadProgressBar.style.width = '0%';
  elDropzone.classList.remove('dragover');
  elBtnSubmitUpload.disabled = true;
}

export function openUpload() {
  if (!state.user) return;
  resetUploadForm();
  openModal(elUploadModal);
}

export function closeUpload() {
  closeModal(elUploadModal);
}

function showUploadError(message) {
  elUploadError.textContent = message;
  show(elUploadError, true);
}

export function selectFile(file) {
  show(elUploadError, false);
  if (!file) return;
  const [problem] = validateGpxUpload(file);
  if (problem) {
    showUploadError(t(problem.key, problem.params));
    return;
  }
  selectedFile = file;
  elDropzoneFilename.textContent = file.name;
  show(elDropzoneFilename, true);
  elBtnSubmitUpload.disabled = false;
  if (!elUploadName.value) elUploadName.value = defaultTourName(file.name);
}

export async function submitUpload(e) {
  e.preventDefault();
  if (!selectedFile) return;

  const query = buildUploadQuery({
    name: elUploadName.value,
    description: elUploadDescription.value,
  });

  const token = await getAccessToken();
  elBtnSubmitUpload.disabled = true;
  show(elUploadError, false);
  show(elUploadProgress, true);
  elUploadProgressBar.style.width = '0%';
  try {
    const { tourId } = await xhrUpload(
      `${API_BASE}/api/tours/upload?${query}`,
      selectedFile,
      token,
      (p) => {
        elUploadProgressBar.style.width = `${p}%`;
      },
    );
    closeUpload();
    await loadTours();
    selectTour(tourId); // success → jump to the new tour's route
    toast(t('toast.tourUploaded'), 'success');
  } catch (err) {
    showUploadError(tApi(err.message));
    show(elUploadProgress, false);
    elBtnSubmitUpload.disabled = false;
  }
}
