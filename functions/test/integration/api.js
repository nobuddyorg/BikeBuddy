'use strict';

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

function fileForm({ content, type, filename }) {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), filename);
  return form;
}

/**
 * The API as one caller: every request carries `headers` (its Authorization, or none).
 *
 * @param {{ baseUrl: string, headers: Record<string, string> }} caller
 */
function apiClient({ baseUrl, headers }) {
  const request = (path, init = {}) =>
    fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...init.headers } });

  const sendJson = (path, { method, body }) =>
    request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const uploadTour = ({ name, gpx = SAMPLE_GPX }) =>
    request(`/tours/upload?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: fileForm({ content: gpx, type: 'application/gpx+xml', filename: 'ride.gpx' }),
    });

  const uploadImage = ({ tourId, jpeg }) =>
    request(`/tours/${tourId}/images`, {
      method: 'POST',
      body: fileForm({ content: jpeg, type: 'image/jpeg', filename: 'photo.jpg' }),
    });

  // For calls a test depends on: any other status is a failed precondition, not a result.
  async function expectJson(response, { status, call }) {
    if (response.status !== status) throw new Error(`${call} answered ${response.status}`);
    return response.json();
  }

  const readJson = async (path) =>
    expectJson(await request(path), { status: 200, call: `GET ${path}` });

  /** Seeds a tour through the API; its id. */
  async function createTour({ name, gpx = SAMPLE_GPX }) {
    const created = await expectJson(await uploadTour({ name, gpx }), {
      status: 201,
      call: 'POST /tours/upload',
    });
    return created.tourId;
  }

  /** Seeds a photo through the API; the signed image the upload answers with. */
  const addPhoto = async ({ tourId, jpeg }) =>
    expectJson(await uploadImage({ tourId, jpeg }), {
      status: 201,
      call: `POST /tours/${tourId}/images`,
    });

  // Cleanup that fails loudly: the account and everything under it, documents and blobs.
  async function deleteAccount() {
    const response = await request('/account', { method: 'DELETE' });
    if (response.status !== 204) throw new Error(`Account cleanup answered ${response.status}`);
  }

  return {
    request,
    sendJson,
    uploadTour,
    uploadImage,
    readJson,
    createTour,
    addPhoto,
    deleteAccount,
  };
}

module.exports = { UUID_PATTERN, ISO_TIMESTAMP_PATTERN, SAMPLE_GPX, apiClient };
