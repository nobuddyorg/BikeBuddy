import { groupByProximity, fanOffsets } from '../lib/pinLayout.js';
import { geotaggedImages, indexOfImage } from '../lib/images.js';
import * as i18n from './i18n.js';
import { state } from './state.js';
import { map } from './map.js';
import { setVisible, pinToggle } from './dom.js';
import { openLightbox } from './lightbox.js';

const t = i18n.t;
const L = window.L;

const PIN_GROUP_THRESHOLD_PX = 24;
const PIN_FAN_RADIUS_PX = 16;
const PIN_MIN_ZOOM = 7;
const PIN_SIZE_PX = 28;

const shownPhotos = () =>
  geotaggedImages({ tours: state.tours, selectedTourId: state.selectedTourId });

// L.divIcon's element form, not its string form: img.src is a property write
// rather than parsed markup. The URLs are safe today, but only because of how
// the backend names blobs.
function photoPinIcon({ thumbUrl, url }) {
  const image = document.createElement('img');
  image.src = thumbUrl || url;
  image.alt = t('lightbox.imgAlt');
  // thumbUrl 404s for photos that predate #466's real-thumbnail work (no
  // thumb blob yet, but SAS signing doesn't check existence) — fall back to
  // the full image rather than leaving the pin blank.
  if (thumbUrl) image.addEventListener('error', () => (image.src = url), { once: true });
  return L.divIcon({
    className: 'photo-pin',
    html: image,
    iconSize: [PIN_SIZE_PX, PIN_SIZE_PX],
    iconAnchor: [PIN_SIZE_PX / 2, PIN_SIZE_PX / 2],
  });
}

// Kept across renderPins() calls so a re-render repositions markers instead of
// recreating their DOM, which flickered the pin images on every zoom step.
const pinMarkers = new Map();

export function clearPins() {
  if (state.pinLayer) {
    map.removeLayer(state.pinLayer);
    state.pinLayer = null;
  }
  pinMarkers.clear();
}

// The thumbnail, not the up-to-2000px image the lightbox needs, paints the
// small marker (#466).
function createPinMarker(photo, position) {
  const marker = L.marker(position, { icon: photoPinIcon(photo) });
  marker.on('click', () => {
    const photos = shownPhotos();
    openLightbox(photos, indexOfImage(photos, photo.id));
  });
  return marker;
}

// Grouping and fanning work in screen pixels at the current zoom, so
// overlapping pins separate and re-collapse live as the user zooms.
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

// Below PIN_MIN_ZOOM photos from unrelated tours fall into the same group and
// clutter the fan, so pins are hidden entirely down there.
export function renderPins() {
  const photos = shownPhotos();
  setVisible(pinToggle, photos.length > 0);
  if (!state.showPins || photos.length === 0 || map.getZoom() < PIN_MIN_ZOOM) {
    clearPins();
    return;
  }

  const shownIds = new Set();
  const added = [];
  for (const { photo, position } of pinPositions(photos)) {
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

  // Drop markers for photos no longer present (deleted, or tour data reloaded).
  for (const [photoId, marker] of pinMarkers) {
    if (shownIds.has(photoId)) continue;
    state.pinLayer?.removeLayer(marker);
    pinMarkers.delete(photoId);
  }

  if (!state.pinLayer) state.pinLayer = L.layerGroup().addTo(map);
  added.forEach((marker) => state.pinLayer.addLayer(marker));
}
