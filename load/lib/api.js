// Each call is tagged with its endpoint so the report splits latency by endpoint as well as by scenario.
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

function expectStatus(response, { endpoint, status }) {
  if (response.error_code === REQUEST_TIMEOUT) timeouts.add(1, { endpoint });
  check(response, { [`${endpoint} ${status}`]: (checked) => checked.status === status });
  return response.status === status;
}

export function getMe() {
  const response = http.get(`${API_URL}/api/v1/me`, params('GET /me'));
  expectStatus(response, { endpoint: 'GET /me', status: 200 });
}

export function listTours() {
  const response = http.get(`${API_URL}/api/v1/tours`, params('GET /tours'));
  return expectStatus(response, { endpoint: 'GET /tours', status: 200 }) ? response.json() : [];
}

export function getTour(id) {
  const response = http.get(`${API_URL}/api/v1/tours/${id}`, params('GET /tours/{id}'));
  expectStatus(response, { endpoint: 'GET /tours/{id}', status: 200 });
}

export function getMap() {
  const response = http.get(`${API_URL}/api/v1/map`, params('GET /map'));
  expectStatus(response, { endpoint: 'GET /map', status: 200 });
}

export function exportData() {
  const response = http.get(
    `${API_URL}/api/v1/me/export`,
    params('GET /me/export', { timeout: '120s' }),
  );
  expectStatus(response, { endpoint: 'GET /me/export', status: 200 });
}

export function uploadTour(name, gpx) {
  const response = http.post(
    `${API_URL}/api/v1/tours`,
    { name, file: http.file(gpx, 'ride.gpx', 'application/gpx+xml') },
    params('POST /tours', { timeout: '120s' }),
  );
  return expectStatus(response, { endpoint: 'POST /tours', status: 201 })
    ? response.json().id
    : null;
}

export function uploadImage(tourId, jpeg) {
  const response = http.post(
    `${API_URL}/api/v1/tours/${tourId}/images`,
    { file: http.file(jpeg, 'photo.jpg', 'image/jpeg') },
    params('POST /tours/{id}/images'),
  );
  return expectStatus(response, { endpoint: 'POST /tours/{id}/images', status: 201 })
    ? response.json().id
    : null;
}

export function editTour(tourId, body) {
  const response = http.patch(
    `${API_URL}/api/v1/tours/${tourId}`,
    JSON.stringify(body),
    params('PATCH /tours/{id}', { headers: { 'Content-Type': 'application/json' } }),
  );
  expectStatus(response, { endpoint: 'PATCH /tours/{id}', status: 200 });
}

export function deleteImage(tourId, imageId) {
  const response = http.del(
    `${API_URL}/api/v1/tours/${tourId}/images/${imageId}`,
    null,
    params('DELETE /tours/{id}/images/{imageId}'),
  );
  expectStatus(response, { endpoint: 'DELETE /tours/{id}/images/{imageId}', status: 204 });
}

export function deleteTour(tourId) {
  const response = http.del(
    `${API_URL}/api/v1/tours/${tourId}`,
    null,
    params('DELETE /tours/{id}'),
  );
  expectStatus(response, { endpoint: 'DELETE /tours/{id}', status: 204 });
}
