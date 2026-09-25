import { mapContainer, appLayout, detailPanel } from './dom.js';

const L = window.L;

// Southern Germany, until the first tours load and the map fits them.
const INITIAL_VIEW = { center: [48.5, 10.5], zoom: 6 };

export const map = L.map('map', INITIAL_VIEW);

// iOS Safari's native pinch-zoom is driven by private gesturestart/
// gesturechange events that ignore touch-action entirely, so pinching over
// the map would otherwise zoom the whole page instead of (or racing)
// Leaflet's own touch handling. This is the only hook that reaches that
// gesture, and — unlike the maximum-scale/user-scalable meta tag this used
// to lean on — it's scoped to the map container instead of the whole
// document.
const leafletContainer = map.getContainer();
leafletContainer.addEventListener('gesturestart', (event) => event.preventDefault());
leafletContainer.addEventListener('gesturechange', (event) => event.preventDefault());

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

// Tile URLs are JS state, so the CSS palette's prefers-color-scheme switch
// doesn't reach them. CARTO's dark tiles are low-contrast by design, hence the
// extra map-tiles-dark filter in style.css.
function applyMapTheme(theme) {
  tileLayer.setUrl(TILE_URLS[theme]);
  tileLayer.getContainer()?.classList.toggle('map-tiles-dark', theme === 'dark');
}

const themeOf = (darkQuery) => (darkQuery.matches ? 'dark' : 'light');
const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
applyMapTheme(themeOf(darkMediaQuery));
darkMediaQuery.addEventListener('change', (event) => applyMapTheme(themeOf(event)));

// Plain object, not the Leaflet bounds, so toursInView stays testable without
// Leaflet.
export function mapBoundsPlain() {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

// Leaflet caches the container size, so a panel opening or the window resizing
// leaves gray space until it is recomputed after the reflow.
export function refreshMapSize() {
  requestAnimationFrame(() => map.invalidateSize());
}
window.addEventListener('resize', refreshMapSize);

// window 'resize' alone misses layout shifts that change the container's own
// size without the viewport changing — e.g. the mobile sidebar growing once
// tours load, or a browser toolbar collapsing without firing 'resize'. Left
// unhandled, Leaflet keeps panning/zooming against its stale cached size,
// which is what made the map look off-center on first load on mobile.
new ResizeObserver(refreshMapSize).observe(map.getContainer());

// Matches style.css's mobile breakpoint. Checked only at the moments below
// (detail open/close, expand toggle), not live on resize.
const MOBILE_LAYOUT_QUERY = '(max-width: 768px)';

export function isMobileLayout() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

// There is only ever one Leaflet instance. On mobile its container
// (.map-container, with the shared top-controls bar) is physically moved
// into the detail panel to act as that tour's preview, instead of spinning up
// a second map — moving Leaflet's container and calling invalidateSize() is
// all it needs to keep working.
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
