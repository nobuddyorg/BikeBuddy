// One function per API call the frontend makes, tagged with the endpoint name so
// the report can split latency by endpoint as well as by scenario.
import { check } from 'k6';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

import { API_URL, AUTH_HEADERS } from './target.js';

const params = (name, extra = {}) => ({
  headers: { ...AUTH_HEADERS, ...(extra.headers ?? {}) },
  tags: { endpoint: name },
  ...(extra.timeout && { timeout: extra.timeout }),
});

// k6's error code for a request that ran into its own timeout (k6 docs, "Error codes").
const REQUEST_TIMEOUT = 1050;
const timeouts = new Counter('http_req_timeouts');

function expectStatus(res, name, status) {
  if (res.error_code === REQUEST_TIMEOUT) timeouts.add(1, { endpoint: name });
  check(res, { [`${name} ${status}`]: (r) => r.status === status });
  return res.status === status;
}

export function getMe() {
  const res = http.get(`${API_URL}/api/me`, params('GET /me'));
  expectStatus(res, 'GET /me', 200);
}

export function listTours() {
  const res = http.get(`${API_URL}/api/tours`, params('GET /tours'));
  return expectStatus(res, 'GET /tours', 200) ? res.json() : [];
}

export function getTour(id) {
  const res = http.get(`${API_URL}/api/tours/${id}`, params('GET /tours/{id}'));
  return expectStatus(res, 'GET /tours/{id}', 200) ? res.json() : null;
}

export function getMap() {
  const res = http.get(`${API_URL}/api/map`, params('GET /map'));
  expectStatus(res, 'GET /map', 200);
}

export function exportData() {
  const res = http.get(`${API_URL}/api/me/export`, params('GET /me/export', { timeout: '120s' }));
  expectStatus(res, 'GET /me/export', 200);
}

export function uploadTour(name, gpx) {
  const res = http.post(
    `${API_URL}/api/tours/upload?name=${encodeURIComponent(name)}`,
    { file: http.file(gpx, 'ride.gpx', 'application/gpx+xml') },
    params('POST /tours/upload', { timeout: '120s' }),
  );
  return expectStatus(res, 'POST /tours/upload', 201) ? res.json().tourId : null;
}

export function uploadImage(tourId, jpeg) {
  const res = http.post(
    `${API_URL}/api/tours/${tourId}/images`,
    { file: http.file(jpeg, 'photo.jpg', 'image/jpeg') },
    params('POST /tours/{id}/images'),
  );
  return expectStatus(res, 'POST /tours/{id}/images', 201) ? res.json().id : null;
}

export function editTour(tourId, body) {
  const res = http.patch(
    `${API_URL}/api/tours/${tourId}`,
    JSON.stringify(body),
    params('PATCH /tours/{id}', { headers: { 'Content-Type': 'application/json' } }),
  );
  expectStatus(res, 'PATCH /tours/{id}', 200);
}

export function deleteImage(tourId, imageId) {
  const res = http.del(
    `${API_URL}/api/tours/${tourId}/images/${imageId}`,
    null,
    params('DELETE /tours/{id}/images/{imageId}'),
  );
  expectStatus(res, 'DELETE /tours/{id}/images/{imageId}', 204);
}

export function deleteTour(tourId) {
  const res = http.del(`${API_URL}/api/tours/${tourId}`, null, params('DELETE /tours/{id}'));
  expectStatus(res, 'DELETE /tours/{id}', 204);
}
