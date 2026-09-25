import { isVerticalIntent } from '../lib/gestures.js';
import { clampIndex, imagesOfTour, wrapIndex } from '../lib/images.js';
import * as i18n from './i18n.js';
import {
  show,
  elLightbox,
  elLightboxStage,
  elLightboxImg,
  elLightboxError,
  elLightboxCounter,
  elLightboxNavbar,
  elBtnLightboxDelete,
} from './dom.js';
import { openModal, closeModal } from './modal.js';
import { confirmDeletePhoto, scheduleImageRemoval } from './photoRemoval.js';
import { refreshSelectedTourImages } from './tourData.js';
import { announce, GALLERY_CHANGED } from './events.js';

const t = i18n.t;

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
  if (!swiping && isVerticalIntent({ dx, dy })) {
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
  lightboxIndex = wrapIndex({ index: lightboxIndex, step: -1, length: lightboxImages.length });
  renderLightbox();
}

export function lightboxNext() {
  if (lightboxImages.length === 0) return;
  lightboxIndex = wrapIndex({ index: lightboxIndex, step: 1, length: lightboxImages.length });
  renderLightbox();
}

export function closeLightbox() {
  closeModal(elLightbox);
  elLightboxImg.src = '';
  lightboxImages = [];
}

export async function retryLightboxImage() {
  const tour = await refreshSelectedTourImages();
  if (!tour) return;
  announce(GALLERY_CHANGED);
  lightboxImages = imagesOfTour(tour);
  lightboxIndex = clampIndex(lightboxIndex, lightboxImages.length);
  renderLightbox();
}

// Deletes the photo currently shown, then clamps the index into whatever
// remains — no special-casing needed as the array shrinks.
async function deleteCurrentLightboxPhoto() {
  const image = currentLightboxImage();
  if (!image) return;
  const ok = await confirmDeletePhoto();
  if (!ok) return;

  scheduleImageRemoval(image, image.tourId);
  lightboxImages.splice(lightboxIndex, 1);

  if (lightboxImages.length === 0) {
    closeLightbox();
    return;
  }
  lightboxIndex = clampIndex(lightboxIndex, lightboxImages.length);
  renderLightbox();
}

elBtnLightboxDelete.addEventListener('click', deleteCurrentLightboxPhoto);
