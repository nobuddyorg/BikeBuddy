'use strict';

import * as i18n from '../lib/i18n.js';
import { validateGpxUpload } from '../lib/files.js';
import { xhrUpload } from '../lib/upload.js';
import { state } from './state.js';
import { getAccessToken, API_BASE } from './auth.js';
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
  const uploadError = validateGpxUpload(file);
  if (uploadError) {
    showUploadError(t(uploadError));
    return;
  }
  selectedFile = file;
  elDropzoneFilename.textContent = file.name;
  show(elDropzoneFilename, true);
  elBtnSubmitUpload.disabled = false;
  if (!elUploadName.value) elUploadName.value = file.name.replace(/\.gpx$/i, '');
}

export async function submitUpload(e) {
  e.preventDefault();
  if (!selectedFile) return;

  const params = new URLSearchParams();
  if (elUploadName.value.trim()) params.set('name', elUploadName.value.trim());
  if (elUploadDescription.value.trim()) params.set('description', elUploadDescription.value.trim());

  const token = await getAccessToken();
  elBtnSubmitUpload.disabled = true;
  show(elUploadError, false);
  show(elUploadProgress, true);
  elUploadProgressBar.style.width = '0%';
  try {
    const { tourId } = await xhrUpload(
      `${API_BASE}/api/tours/upload?${params.toString()}`,
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
