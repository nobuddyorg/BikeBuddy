'use strict';

// Every route the host registers, as the authorization matrix calls it; test/unit keeps it complete.

const PUBLIC_ENDPOINTS = [{ method: 'GET', route: 'health' }];

/**
 * `send(api, target)` makes the call as whoever `api` is, aimed at `target`'s tour, image and photo.
 * Each write would change the target visibly if it got through.
 */
const AUTHENTICATED_ENDPOINTS = [
  { method: 'GET', route: 'tours', send: (api) => api.request('/tours') },
  {
    method: 'POST',
    route: 'tours/upload',
    send: (api) => api.uploadTour({ name: 'Uploaded by the wrong caller' }),
  },
  {
    method: 'GET',
    route: 'tours/{tourId}',
    send: (api, { tourId }) => api.request(`/tours/${tourId}`),
  },
  {
    method: 'PATCH',
    route: 'tours/{tourId}',
    send: (api, { tourId }) =>
      api.sendJson(`/tours/${tourId}`, {
        method: 'PATCH',
        body: { name: 'Renamed by the wrong caller', description: 'Not theirs' },
      }),
  },
  {
    method: 'DELETE',
    route: 'tours/{tourId}',
    send: (api, { tourId }) => api.request(`/tours/${tourId}`, { method: 'DELETE' }),
  },
  {
    method: 'POST',
    route: 'tours/{tourId}/images',
    send: (api, { tourId, jpeg }) => api.uploadImage({ tourId, jpeg }),
  },
  {
    method: 'DELETE',
    route: 'tours/{tourId}/images/{imageId}',
    send: (api, { tourId, imageId }) =>
      api.request(`/tours/${tourId}/images/${imageId}`, { method: 'DELETE' }),
  },
  { method: 'GET', route: 'map', send: (api) => api.request('/map') },
  { method: 'GET', route: 'me', send: (api) => api.request('/me') },
  {
    method: 'PATCH',
    route: 'me',
    send: (api) =>
      api.sendJson('/me', { method: 'PATCH', body: { name: 'Renamed by the wrong caller' } }),
  },
  { method: 'GET', route: 'me/export', send: (api) => api.request('/me/export') },
  {
    method: 'DELETE',
    route: 'account',
    send: (api) => api.request('/account', { method: 'DELETE' }),
  },
];

const TOUR_SCOPED_ENDPOINTS = AUTHENTICATED_ENDPOINTS.filter(({ route }) =>
  route.startsWith('tours/{tourId}'),
);
// Rows for test.each('%s …'): its `$property` titles would quote every string.
const named = (endpoints) =>
  endpoints.map((endpoint) => [`${endpoint.method} /api/${endpoint.route}`, endpoint]);

module.exports = {
  PUBLIC_ENDPOINTS,
  AUTHENTICATED_ENDPOINTS,
  TOUR_SCOPED_ENDPOINTS,
  named,
};
