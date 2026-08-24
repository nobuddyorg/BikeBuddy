'use strict';

import { elMapContainer, elAppLayout, elDetailPanel } from './dom.js';

const L = window.L;

export const map = L.map('map', { center: [48.5, 10.5], zoom: 6 });

// iOS Safari's native pinch-zoom is driven by private gesturestart/
// gesturechange events that ignore touch-action entirely, so pinching over
// the map would otherwise zoom the whole page instead of (or racing)
// Leaflet's own touch handling. This is the only hook that reaches that
// gesture, and — unlike the maximum-scale/user-scalable meta tag this used
// to lean on — it's scoped to the map container instead of the whole
// document.
const mapContainer = map.getContainer();
mapContainer.addEventListener('gesturestart', (e) => e.preventDefault());
mapContainer.addEventListener('gesturechange', (e) => e.preventDefault());

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
function applyMapTheme(isDark) {
  tileLayer.setUrl(isDark ? TILE_URLS.dark : TILE_URLS.light);
  tileLayer.getContainer()?.classList.toggle('map-tiles-dark', isDark);
}

const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
applyMapTheme(darkMediaQuery.matches);
darkMediaQuery.addEventListener('change', (e) => applyMapTheme(e.matches));

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
export function isMobileLayout() {
  return window.matchMedia('(max-width: 768px)').matches;
}

// There is only ever one Leaflet instance. On mobile its container
// (.map-container, with the shared top-controls bar) is physically moved
// into the detail panel to act as that tour's preview, instead of spinning up
// a second map — moving Leaflet's container and calling invalidateSize() is
// all it needs to keep working.
export function moveMapIntoDetailPanel() {
  if (elMapContainer.classList.contains('in-detail')) return;
  elMapContainer.classList.add('in-detail');
  elDetailPanel.insertBefore(elMapContainer, elDetailPanel.firstChild);
  refreshMapSize();
}

export function restoreMapToAppLayout() {
  if (!elMapContainer.classList.contains('in-detail')) return;
  elMapContainer.classList.remove('in-detail');
  elAppLayout.insertBefore(elMapContainer, elDetailPanel);
  refreshMapSize();
}
