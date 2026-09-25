'use strict';

// Precaches the app shell so the installed PWA opens offline instead of
// showing a blank page — the app's own "Couldn't load your tours" state
// (sidebar.js) then takes over once a fetch actually fails.
//
// Bump this on any change to the precached shell (added/removed file, or
// content change the browser wouldn't otherwise know to refetch) — it's the
// only thing that invalidates a previously installed cache.
const CACHE_NAME = 'bikebuddy-shell-v13';

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
  'lib/authConfig.js',
  'lib/concurrency.js',
  'lib/debounce.js',
  'lib/files.js',
  'lib/format.js',
  'lib/gestures.js',
  'lib/i18n.js',
  'lib/images.js',
  'lib/layout.js',
  'lib/lineStyle.js',
  'lib/mapData.js',
  'lib/pinLayout.js',
  'lib/routes.js',
  'lib/sasCache.js',
  'lib/sidebarView.js',
  'lib/stats.js',
  'lib/tourDetail.js',
  'lib/tours.js',
  'lib/upload.js',
  'lib/url.js',
  'ui/api.js',
  'ui/auth.js',
  'ui/clickGuard.js',
  'ui/confirm.js',
  'ui/dom.js',
  'ui/events.js',
  'ui/gallery.js',
  'ui/i18n.js',
  'ui/imageUpload.js',
  'ui/lightbox.js',
  'ui/lineStyleStorage.js',
  'ui/map.js',
  'ui/menus.js',
  'ui/modal.js',
  'ui/photoRemoval.js',
  'ui/pins.js',
  'ui/popover.js',
  'ui/profile.js',
  'ui/router.js',
  'ui/routes.js',
  'ui/selectMode.js',
  'ui/sidebar.js',
  'ui/state.js',
  'ui/statsModal.js',
  'ui/toast.js',
  'ui/tourData.js',
  'ui/tourGestures.js',
  'ui/tourList.js',
  'ui/tourPanel.js',
  'ui/tourRemoval.js',
  'ui/undoableAction.js',
  'ui/uploadModal.js',
  'ui/uploadRequest.js',
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
            // config.js is generated per deployment and gitignored, so a dev
            // checkout may lack it; every other asset must be there.
            url === 'config.js' ? cache.add(url).catch(() => {}) : cache.add(url),
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
  if (url.origin !== self.location.origin) return; // map tiles — network only, never cached
  // The API is same-origin when Azure Static Web Apps proxies it (see
  // ui/auth.js's API_BASE), so it isn't ruled out by the origin check above —
  // responses must always be live, never served from the shell cache.
  if (url.pathname.startsWith('/api/')) return;

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
