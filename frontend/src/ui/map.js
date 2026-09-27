import { mapContainer, appLayout, detailPanel } from './dom.js';

const L = window.L;

const INITIAL_VIEW = { center: [48.5, 10.5], zoom: 6 };

// One canvas for every route: SVG keeps a DOM path per tour and re-projects each on every zoom.
// Leaflet takes maxZoom from tile layers, which the MapLibre basemap is not: without it, fits go to Infinity.
export const map = L.map('map', { ...INITIAL_VIEW, preferCanvas: true, maxZoom: 19 });

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
// Leaflet ignores a new view while a zoom animation runs: the latest one waits and then jumps
// there unanimated. data-zooming marks the animation, so a test can wait for it.
let zoomAnimating = false;
let movesAfterZoom = [];
map.on('zoomanim', () => {
  zoomAnimating = true;
  leafletContainer.dataset.zooming = '';
});
map.on('zoomend', () => {
  zoomAnimating = false;
  const moves = movesAfterZoom;
  movesAfterZoom = [];
  moves.forEach((moveCamera) => moveCamera({ animate: false }));
  delete leafletContainer.dataset.zooming;
});

export function whenCameraFree(moveCamera) {
  if (zoomAnimating) movesAfterZoom = [moveCamera];
  else moveCamera({});
}

// Keyless, unmetered vector tiles; the styles carry OpenFreeMap's attribution themselves.
const BASEMAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.addEventListener('load', resolve);
    script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)));
    document.head.append(script);
  });
}

const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

// The phone layout starts with the map hidden (#580); a hidden container measures zero.
const mapShown = () =>
  new Promise((resolve) => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === 0) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(leafletContainer);
  });

// MapLibre is large, so it loads once the map is shown and the page has painted:
// the list and the routes never wait for it.
async function loadMapLibre() {
  await mapShown();
  await nextPaint();
  window.maplibregl = await import('../vendor/maplibre-gl/maplibre-gl.mjs');
  // The Leaflet binding reads the global maplibregl once, when it runs.
  await loadScript('vendor/maplibre-gl-leaflet/leaflet-maplibre-gl.js');
}

// Styles are JS state, out of reach of the stylesheets' prefers-color-scheme switch.
const themeOf = (darkQuery) => (darkQuery.matches ? 'dark' : 'light');
const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
leafletContainer.dataset.tiles = themeOf(darkMediaQuery);

let basemap;

export function showBasemap() {
  basemap = loadMapLibre().then(() =>
    L.maplibreGL({ style: BASEMAP_STYLES[leafletContainer.dataset.tiles] }).addTo(map),
  );
  return basemap;
}

darkMediaQuery.addEventListener('change', (event) => {
  const theme = themeOf(event);
  leafletContainer.dataset.tiles = theme;
  basemap?.then((layer) => layer.getMaplibreMap().setStyle(BASEMAP_STYLES[theme]));
});

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
