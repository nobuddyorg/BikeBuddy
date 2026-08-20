'use strict';

import * as i18n from '../lib/i18n.js';
import { groupByProximity, fanOffsets } from '../lib/pinLayout.js';
import { state } from './state.js';
import { map } from './map.js';
import { show, elPinToggle } from './dom.js';
import { openLightbox } from './images.js';

const t = i18n.t;
const L = window.L;

const PIN_GROUP_THRESHOLD_PX = 24;
const PIN_FAN_RADIUS_PX = 16;
const PIN_MIN_ZOOM = 7;

// Scoped to the selected tour so its pins never leak in photos from others,
// and across every loaded tour on the full map.
function geotaggedImages() {
  const tours = state.selectedTourId
    ? state.tours.filter((t) => t.id === state.selectedTourId)
    : state.tours;
  return tours.flatMap((t) =>
    (t.images || [])
      .filter((img) => typeof img.lat === 'number' && typeof img.lon === 'number')
      .map((img) => ({ ...img, tourId: t.id })),
  );
}

// L.divIcon's element form, not its string form: img.src is a property write
// rather than parsed markup. The URLs are safe today, but only because of how
// the backend names blobs.
function photoPinIcon(url) {
  const img = document.createElement('img');
  img.src = url;
  img.alt = t('lightbox.imgAlt');
  return L.divIcon({
    className: 'photo-pin',
    html: img,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
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

function makePinMarker(img, latlng) {
  const marker = L.marker(latlng, { icon: photoPinIcon(img.url) });
  marker.on('click', () => {
    const images = geotaggedImages();
    const index = images.findIndex((i) => i.id === img.id);
    openLightbox(images, index < 0 ? 0 : index);
  });
  return marker;
}

// Grouping and fanning work in screen pixels at the current zoom, so
// overlapping pins separate and re-collapse live as the user zooms. Below
// PIN_MIN_ZOOM photos from unrelated tours fall into the same group and clutter
// the fan, so pins are hidden entirely down there.
export function renderPins() {
  const images = geotaggedImages();
  show(elPinToggle, images.length > 0);
  if (!state.showPins || images.length === 0 || map.getZoom() < PIN_MIN_ZOOM) {
    clearPins();
    return;
  }

  const zoom = map.getZoom();
  const points = images.map((img) => {
    const { x, y } = map.project([img.lat, img.lon], zoom);
    return { x, y, img };
  });

  const seen = new Set();
  const added = [];
  groupByProximity(points, PIN_GROUP_THRESHOLD_PX).forEach((group) => {
    const offsets = fanOffsets(group.length, PIN_FAN_RADIUS_PX);
    group.forEach((point, i) => {
      const [dx, dy] = offsets[i];
      const latlng = map.unproject([point.x + dx, point.y + dy], zoom);
      seen.add(point.img.id);
      const existing = pinMarkers.get(point.img.id);
      if (existing) {
        existing.setLatLng(latlng);
      } else {
        const marker = makePinMarker(point.img, latlng);
        pinMarkers.set(point.img.id, marker);
        added.push(marker);
      }
    });
  });

  // Drop markers for photos no longer present (deleted, or tour data reloaded).
  for (const [id, marker] of pinMarkers) {
    if (seen.has(id)) continue;
    state.pinLayer?.removeLayer(marker);
    pinMarkers.delete(id);
  }

  if (!state.pinLayer) state.pinLayer = L.layerGroup().addTo(map);
  added.forEach((marker) => state.pinLayer.addLayer(marker));
}
