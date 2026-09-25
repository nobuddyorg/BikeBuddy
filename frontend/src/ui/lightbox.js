import { isVerticalIntent } from '../lib/gestures.js';
import { clampIndex, imagesOfTour, wrapIndex } from '../lib/images.js';
import * as i18n from './i18n.js';
import {
  showElement,
  hideElement,
  setVisible,
  lightboxModal,
  lightboxStage,
  lightboxImage,
  lightboxError,
  lightboxCounter,
  lightboxNavbar,
  lightboxDeleteButton,
} from './dom.js';
import { openModal, closeModal } from './modal.js';
import { confirmDeletePhoto, scheduleImageRemoval } from './photoRemoval.js';
import { refreshSelectedTourImages } from './tourData.js';
import { createClickGuard } from './clickGuard.js';
import { announce, GALLERY_CHANGED } from './events.js';

const t = i18n.t;

const SWIPE_THRESHOLD_PX = 50;

// Photos carry their tourId: a pin opened on the full map can show several tours' photos.
let photos = [];
let currentIndex = 0;

const currentPhoto = () => photos[currentIndex];

function renderLightbox() {
  const photo = currentPhoto();
  if (!photo) return;
  hideElement(lightboxError);
  showElement(lightboxImage);
  lightboxImage.src = photo.url;
  lightboxCounter.textContent = t('lightbox.counter', {
    current: currentIndex + 1,
    total: photos.length,
  });
  setVisible(lightboxNavbar, photos.length > 1);
  setVisible(lightboxDeleteButton, Boolean(photo.tourId));
}

function step(offset) {
  if (photos.length === 0) return;
  currentIndex = wrapIndex({ index: currentIndex, step: offset, length: photos.length });
  renderLightbox();
}

export const showPreviousPhoto = () => step(-1);
export const showNextPhoto = () => step(1);

export function openLightbox(images, index) {
  photos = images;
  currentIndex = index;
  renderLightbox();
  openModal(lightboxModal, closeLightbox);
}

export function closeLightbox() {
  closeModal(lightboxModal);
  lightboxImage.src = '';
  photos = [];
}

export async function retryLightboxImage() {
  const tour = await refreshSelectedTourImages();
  if (!tour) return;
  announce(GALLERY_CHANGED);
  photos = imagesOfTour(tour);
  currentIndex = clampIndex(currentIndex, photos.length);
  renderLightbox();
}

async function deleteCurrentPhoto() {
  const photo = currentPhoto();
  if (!photo) return;
  const confirmed = await confirmDeletePhoto();
  if (!confirmed) return;

  scheduleImageRemoval(photo, photo.tourId);
  photos.splice(currentIndex, 1);
  if (photos.length === 0) {
    closeLightbox();
    return;
  }
  currentIndex = clampIndex(currentIndex, photos.length);
  renderLightbox();
}

// The guard keeps a swipe's trailing synthetic click from closing the lightbox.
function bindSwipe() {
  const guardAgainstGhostClick = createClickGuard({ scope: lightboxImage });
  let start;
  let swiping = false;

  lightboxStage.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    start = { x: event.clientX, y: event.clientY };
    swiping = false;
  });

  lightboxStage.addEventListener('pointermove', (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!swiping && isVerticalIntent({ dx, dy })) {
      start = undefined; // a vertical drag belongs to the browser
      return;
    }
    swiping = true;
  });

  lightboxStage.addEventListener('pointerup', (event) => {
    const dx = swiping ? event.clientX - start.x : 0;
    start = undefined;
    swiping = false;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    guardAgainstGhostClick();
    step(dx > 0 ? -1 : 1);
  });
}

// A SAS URL can expire while the lightbox is open (see sasCache.js).
lightboxImage.addEventListener('error', () => {
  hideElement(lightboxImage);
  showElement(lightboxError);
});

bindSwipe();

// Overlay clicks close the dialog elsewhere, but the photo covers the overlay here.
lightboxImage.addEventListener('click', closeLightbox);
lightboxDeleteButton.addEventListener('click', deleteCurrentPhoto);
