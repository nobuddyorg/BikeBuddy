'use strict';

// Precaches the app shell so the installed PWA opens offline instead of
// showing a blank page — the app's own "Couldn't load your tours" state
// (sidebar.js) then takes over once a fetch actually fails.
//
// Bump this on any change to the precached shell (added/removed file, or
// content change the browser wouldn't otherwise know to refetch) — it's the
// only thing that invalidates a previously installed cache.
const CACHE_NAME = 'bikebuddy-shell-v1';

const PRECACHE_URLS = [
  './',
  'index.html',
  'app.js',
  'config.js',
  'style.css',
  'manifest.webmanifest',
  'favicon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'vendor/msal-browser.min.js',
  'vendor/fonts/archivo-700.woff2',
  'lib/concurrency.js',
  'lib/files.js',
  'lib/format.js',
  'lib/i18n.js',
  'lib/lineStyle.js',
  'lib/mapData.js',
  'lib/pinLayout.js',
  'lib/sasCache.js',
  'lib/tours.js',
  'lib/upload.js',
  'lib/url.js',
  'ui/auth.js',
  'ui/confirm.js',
  'ui/dom.js',
  'ui/images.js',
  'ui/map.js',
  'ui/menus.js',
  'ui/modal.js',
  'ui/pins.js',
  'ui/profile.js',
  'ui/router.js',
  'ui/routes.js',
  'ui/sidebar.js',
  'ui/state.js',
  'ui/toast.js',
  'ui/tour-detail.js',
  'ui/upload-modal.js',
  'locales/de.json',
  'locales/en.json',
  'locales/es.json',
  'locales/fr.json',
  'locales/it.json',
  'locales/nl.json',
  'locales/pt.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            // config.js is generated per-deployment and gitignored — a dev
            // checkout without one (or any other single missing asset) must
            // not sink the whole precache.
            cache.add(url).catch(() => {}),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // map tiles, the API — network only, never cached

  if (request.mode === 'navigate') {
    // Network-first so a signed-in user always gets a fresh shell when
    // online; only offline does the cached shell take over.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('index.html').then((cached) => cached || caches.match('./')),
      ),
    );
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
