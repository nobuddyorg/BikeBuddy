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

// Each entry is { id, url, tourId } — tourId is what lets the lightbox
// delete a photo without assuming it belongs to state.selectedTourId (a map
// pin opened with no tour selected can show photos from several tours).
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

// Deletes the photo currently shown, then clamps the index into whatever
// remains — no special-casing needed as the array shrinks.
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

// Swipe (touch only, like the tour rows): a horizontal drag past the
// threshold navigates instead of the vertical/pinch gestures the browser
// already owns. The guard stops the swipe's own trailing synthetic click from
// being read as "tap the photo to close".
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
      start = undefined; // a vertical drag — not a swipe the lightbox owns
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

// A SAS URL can expire while the lightbox sits open on it (see sasCache.js) -
// swap in the error state rather than leaving a blank/broken image.
lightboxImage.addEventListener('error', () => {
  hideElement(lightboxImage);
  showElement(lightboxError);
});

bindSwipe();

// Tap-the-photo-to-close (#466): wireModalClose only closes on a click that
// lands on the overlay itself, which stopped covering the image once the
// lightbox became a real focus-trapped modal with prev/next controls.
lightboxImage.addEventListener('click', closeLightbox);
lightboxDeleteButton.addEventListener('click', deleteCurrentPhoto);
