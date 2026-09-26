import { groupByProximity, fanOffsets } from '../lib/pinLayout.js';
import { geotaggedImages, indexOfImage, photosWithin } from '../lib/images.js';
import * as i18n from './i18n.js';
import { state } from './state.js';
import { map, mapBoundsPlain } from './map.js';
import { setVisible, pinToggle } from './dom.js';
import { openLightbox } from './lightbox.js';

const t = i18n.t;
const L = window.L;

const PIN_GROUP_THRESHOLD_PX = 24;
const PIN_FAN_RADIUS_PX = 16;
const PIN_MIN_ZOOM = 7;
const PIN_SIZE_PX = 28;
// Pins just off-screen are placed too, so a short pan shows them before the next render (#580).
const PIN_VIEW_MARGIN = 0.25;

const shownPhotos = () =>
  geotaggedImages({ tours: state.tours, selectedTourId: state.selectedTourId });

// L.divIcon's element form: img.src is a property write, never parsed markup.
function photoPinIcon({ thumbUrl, url }) {
  const image = document.createElement('img');
  // Off-screen pins wait until they are panned into view; decoding never blocks a zoom frame.
  image.loading = 'lazy';
  image.decoding = 'async';
  image.src = thumbUrl || url;
  image.alt = t('lightbox.imgAlt');
  // Photos older than thumbnails have a signed thumbUrl to a missing blob.
  if (thumbUrl) image.addEventListener('error', () => (image.src = url), { once: true });
  return L.divIcon({
    className: 'photo-pin',
    html: image,
    iconSize: [PIN_SIZE_PX, PIN_SIZE_PX],
    iconAnchor: [PIN_SIZE_PX / 2, PIN_SIZE_PX / 2],
  });
}

// Kept across renders: recreating markers made the pin images flicker on every zoom step.
const pinMarkers = new Map();

export function clearPins() {
  if (state.pinLayer) {
    map.removeLayer(state.pinLayer);
    state.pinLayer = null;
  }
  pinMarkers.clear();
}

function createPinMarker(photo, position) {
  const marker = L.marker(position, { icon: photoPinIcon(photo) });
  // Leaflet builds the marker element on add, so the hook is set there.
  marker.on('add', () => {
    marker.getElement().dataset.testid = 'photo-pin';
  });
  marker.on('click', () => {
    const photos = shownPhotos();
    openLightbox(photos, indexOfImage(photos, photo.id));
  });
  return marker;
}

// Grouped in screen pixels, so pins separate and re-collapse as the user zooms.
function pinPositions(photos) {
  const zoom = map.getZoom();
  const points = photos.map((photo) => ({ ...map.project([photo.lat, photo.lon], zoom), photo }));
  return groupByProximity(points, PIN_GROUP_THRESHOLD_PX).flatMap((group) => {
    const offsets = fanOffsets(group.length, PIN_FAN_RADIUS_PX);
    return group.map((point, index) => {
      const [offsetX, offsetY] = offsets[index];
      return {
        photo: point.photo,
        position: map.unproject([point.x + offsetX, point.y + offsetY], zoom),
      };
    });
  });
}

// Below PIN_MIN_ZOOM unrelated tours' photos crowd into one fan, so pins are hidden.
export function renderPins() {
  const photos = shownPhotos();
  setVisible(pinToggle, photos.length > 0);
  if (!state.showPins || photos.length === 0 || map.getZoom() < PIN_MIN_ZOOM) {
    clearPins();
    return;
  }

  const shownIds = new Set();
  const added = [];
  for (const { photo, position } of pinPositions(
    photosWithin(photos, mapBoundsPlain(PIN_VIEW_MARGIN)),
  )) {
    shownIds.add(photo.id);
    const existing = pinMarkers.get(photo.id);
    if (existing) {
      existing.setLatLng(position);
      continue;
    }
    const marker = createPinMarker(photo, position);
    pinMarkers.set(photo.id, marker);
    added.push(marker);
  }

  for (const [photoId, marker] of pinMarkers) {
    if (shownIds.has(photoId)) continue;
    state.pinLayer?.removeLayer(marker);
    pinMarkers.delete(photoId);
  }

  if (!state.pinLayer) state.pinLayer = L.layerGroup().addTo(map);
  added.forEach((marker) => state.pinLayer.addLayer(marker));
}
