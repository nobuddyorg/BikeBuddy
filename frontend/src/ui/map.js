import { mapContainer, appLayout, detailPanel } from './dom.js';

const L = window.L;

const INITIAL_VIEW = { center: [48.5, 10.5], zoom: 6 };

export const map = L.map('map', INITIAL_VIEW);

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

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
};

const tileLayer = L.tileLayer(TILE_URLS.light, {
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

// Tile URLs are JS state, out of reach of the stylesheets' prefers-color-scheme switch.
function applyMapTheme(theme) {
  leafletContainer.dataset.tiles = theme;
  tileLayer.setUrl(TILE_URLS[theme]);
  tileLayer.getContainer()?.classList.toggle('map-tiles-dark', theme === 'dark');
}

const themeOf = (darkQuery) => (darkQuery.matches ? 'dark' : 'light');
const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
applyMapTheme(themeOf(darkMediaQuery));
darkMediaQuery.addEventListener('change', (event) => applyMapTheme(themeOf(event)));

export function mapBoundsPlain() {
  const bounds = map.getBounds();
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
