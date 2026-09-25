'use strict';

// SKIP_AUTH makes every spec the same user, so each creates and removes only its own tours.

const BASE = 'http://localhost:7071/api';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const SAMPLE_GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Integration Tour</name><time>2026-06-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
    <trkpt lat="48.1371" lon="11.5840"/>
  </trkseg></trk>
</gpx>`;

function uploadTour({ name, gpx = SAMPLE_GPX }) {
  const form = new FormData();
  form.append('file', new Blob([gpx], { type: 'application/gpx+xml' }), 'ride.gpx');
  return fetch(`${BASE}/tours/upload?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    body: form,
  });
}

function uploadImage({ tourId, jpeg }) {
  const form = new FormData();
  form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');
  return fetch(`${BASE}/tours/${tourId}/images`, { method: 'POST', body: form });
}

// Cleanup that fails loudly: anything but "deleted" or "already gone" is a leak.
async function deleteTour(tourId) {
  const response = await fetch(`${BASE}/tours/${tourId}`, { method: 'DELETE' });
  if (response.status !== 204 && response.status !== 404) {
    throw new Error(`Cleanup of tour ${tourId} answered ${response.status}`);
  }
  return response.status;
}

module.exports = {
  BASE,
  UUID_PATTERN,
  ISO_TIMESTAMP_PATTERN,
  SAMPLE_GPX,
  uploadTour,
  uploadImage,
  deleteTour,
};
