import { mapContainer, appLayout, detailPanel } from './dom.js';

const L = window.L;

const INITIAL_VIEW = { center: [48.5, 10.5], zoom: 6 };

// One canvas for every route: SVG keeps a DOM path per tour and re-projects each on every zoom.
export const map = L.map('map', { ...INITIAL_VIEW, preferCanvas: true });

// iOS Safari pinch-zooms through gesture events that ignore touch-action; keep it off the page.
const leafletContainer = map.getContainer();
leafletContainer.addEventListener('gesturestart', (event) => event.preventDefault());
leafletContainer.addEventListener('gesturechange', (event) => event.preventDefault());

// data-zoom only changes once a zoom animation has ended, so a test can wait for it.
const recordZoom = () => {
  leafletContainer.dataset.zoom = String(map.getZoom());
};
recordZoom();
map.on('zoomend', recordZoom);

// Keyless under the OSMF tile usage policy: interactive viewing only, no prefetch, attribution shown.
const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

// OpenStreetMap has no dark tiles; a CSS filter darkens the light ones.
function applyMapTheme(theme) {
  leafletContainer.dataset.tiles = theme;
  tileLayer.getContainer()?.classList.toggle('map-tiles-dark', theme === 'dark');
}

const themeOf = (darkQuery) => (darkQuery.matches ? 'dark' : 'light');
const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
applyMapTheme(themeOf(darkMediaQuery));
darkMediaQuery.addEventListener('change', (event) => applyMapTheme(themeOf(event)));

// margin: a fraction of the view added on every side (Leaflet's LatLngBounds.pad).
export function mapBoundsPlain(margin = 0) {
  const bounds = map.getBounds().pad(margin);
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

// Leaflet caches the container size; any resize needs invalidateSize after the reflow.
export function refreshMapSize() {
  requestAnimationFrame(() => map.invalidateSize());
}
window.addEventListener('resize', refreshMapSize);

// 'resize' misses container-only changes (the mobile sidebar growing, a toolbar collapsing).
new ResizeObserver(refreshMapSize).observe(map.getContainer());

// Matches the stylesheets' mobile breakpoint; read at open/close/expand, not live.
const MOBILE_LAYOUT_QUERY = '(max-width: 768px)';

export function isMobileLayout() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

// A phone turned to landscape can cross into the desktop layout, whose map is always shown.
export function whenLeavingMobileLayout(callback) {
  window.matchMedia(MOBILE_LAYOUT_QUERY).addEventListener('change', (event) => {
    if (!event.matches) callback();
  });
}

// On mobile the one Leaflet map moves into the detail panel as the tour's preview.
export function moveMapIntoDetailPanel() {
  if (mapContainer.classList.contains('in-detail')) return;
  mapContainer.classList.add('in-detail');
  detailPanel.insertBefore(mapContainer, detailPanel.firstChild);
  refreshMapSize();
}

export function restoreMapToAppLayout() {
  if (!mapContainer.classList.contains('in-detail')) return;
  mapContainer.classList.remove('in-detail');
  appLayout.insertBefore(mapContainer, detailPanel);
  refreshMapSize();
}
