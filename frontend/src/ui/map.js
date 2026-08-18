'use strict';

const L = window.L;

export const map = L.map('map', { center: [48.5, 10.5], zoom: 6 });

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
