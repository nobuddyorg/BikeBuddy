import { imagesOfTour, indexOfImage } from '../lib/images.js';
import * as i18n from './i18n.js';
import { state } from './state.js';
import { hideElement, imageGrid, imageError, imageDropzone } from './dom.js';
import { openLightbox } from './lightbox.js';
import { deleteGalleryPhoto } from './photoRemoval.js';
import { refreshSelectedTourImages } from './tourData.js';

const t = i18n.t;

export function resetImageSection() {
  imageGrid.innerHTML = '';
  hideElement(imageError);
  imageDropzone.classList.remove('dragover');
}

function createIconButton({ className, testId, label, glyph, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  if (testId) button.dataset.testid = testId;
  button.setAttribute('aria-label', label);
  button.textContent = glyph;
  button.addEventListener('click', onClick);
  return button;
}

function openInLightbox(image) {
  const tour = state.tours.find((candidate) => candidate.id === state.selectedTourId);
  const images = tour ? imagesOfTour(tour) : [];
  openLightbox(images, indexOfImage(images, image.id));
}

// Photos older than thumbnails have a signed thumbUrl to a missing blob: try the full image once.
function handleThumbnailErrors({ thumbnail, tile, image }) {
  let triedFullImage = !image.thumbUrl;
  thumbnail.addEventListener('error', () => {
    if (!triedFullImage) {
      triedFullImage = true;
      thumbnail.src = image.url;
      return;
    }
    renderRetryableErrorTile({
      tile,
      message: t('detail.photoLoadError'),
      retryLabel: t('detail.retryLoadAria'),
      onRetry: retryTourImages,
    });
  });
}

export function createImageTile(image) {
  const tile = document.createElement('figure');
  tile.className = 'image-tile';

  const thumbnail = document.createElement('img');
  thumbnail.className = 'image-thumb';
  thumbnail.src = image.thumbUrl || image.url;
  thumbnail.alt = t('lightbox.imgAlt');
  thumbnail.loading = 'lazy';
  thumbnail.addEventListener('load', () => thumbnail.classList.add('is-loaded'));
  thumbnail.addEventListener('click', () => openInLightbox(image));
  handleThumbnailErrors({ thumbnail, tile, image });

  const deleteButton = createIconButton({
    className: 'image-delete',
    label: t('detail.deletePhotoAria'),
    glyph: '✕',
    onClick: (event) => {
      event.stopPropagation();
      deleteGalleryPhoto(image, tile);
    },
  });

  tile.append(thumbnail, deleteButton);
  return tile;
}

export function renderErrorTile({ tile, message }) {
  tile.className = 'image-tile image-tile-error';
  tile.dataset.testid = 'image-tile-error';
  tile.innerHTML = '';

  const messageElement = document.createElement('p');
  messageElement.className = 'image-tile-error-message';
  messageElement.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'image-tile-actions';
  actions.append(
    createIconButton({
      className: 'image-tile-dismiss',
      testId: 'image-tile-dismiss',
      label: t('detail.dismissPhotoAria'),
      glyph: '✕',
      onClick: () => tile.remove(),
    }),
  );

  tile.append(messageElement, actions);
}

export function renderRetryableErrorTile({ tile, message, retryLabel, onRetry }) {
  renderErrorTile({ tile, message });
  tile.querySelector('.image-tile-actions').prepend(
    createIconButton({
      className: 'image-tile-retry',
      testId: 'image-tile-retry',
      label: retryLabel,
      glyph: '↻',
      onClick: onRetry,
    }),
  );
}

// One expired SAS URL means they all are, so every tile is refetched.
async function retryTourImages() {
  const tour = await refreshSelectedTourImages();
  if (tour) renderGallery(tour);
}

export function renderGallery(tour) {
  imageGrid.innerHTML = '';
  (tour.images || []).forEach((image) => imageGrid.appendChild(createImageTile(image)));
}
