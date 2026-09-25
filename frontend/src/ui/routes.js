import { ensureMapData } from '../lib/mapData.js';
import { hasNoPoints, routePointSets, selectionKey } from '../lib/routes.js';
import { state } from './state.js';
import { map } from './map.js';
import {
  showElement,
  hideElement,
  setVisible,
  mapEmptyOverlay,
  mapLoadErrorOverlay,
  mapLoadingOverlay,
} from './dom.js';
import { apiFetch } from './api.js';
import { renderPins } from './pins.js';

const L = window.L;

const ALL_TOURS_PADDING_PX = 40;
export const SINGLE_TOUR_PADDING_PX = 60;

export function clearRouteLayer() {
  if (state.routeLayer) {
    map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
}

function drawRoutes(pointSets) {
  clearRouteLayer();
  const lines = pointSets
    .filter((points) => points.length > 1)
    .map((points) => L.polyline(points, { ...state.lineStyle, interactive: false }));
  if (lines.length === 0) return;
  state.routeLayer = L.layerGroup(lines).addTo(map);
}

// Applies the current line style to the already-drawn polylines in place —
// no layer teardown/rebuild and no pan/zoom change, so a slider drag stays
// smooth instead of re-creating every polyline on each tick.
export function redrawRoutes() {
  state.routeLayer?.eachLayer((layer) => layer.setStyle(state.lineStyle));
}

function fitToPoints(pointSets, paddingPx) {
  const allPoints = pointSets.flat();
  if (allPoints.length === 0) return;
  // Tours finish loading asynchronously, by which point the container may
  // have resized (mobile sidebar settling, address-bar collapsing) since
  // Leaflet last measured it — fitBounds would otherwise center against that
  // stale size and leave the map visibly panned off.
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(allPoints), { padding: [paddingPx, paddingPx] });
}

export function renderRoutes(pointSets, paddingPx) {
  drawRoutes(pointSets);
  fitToPoints(pointSets, paddingPx);
}

// Resolves to whether the map data loaded; the tours are drawable either way.
async function loadMapData(pendingMapResponse) {
  try {
    await ensureMapData({
      apiFetch,
      tours: state.tours,
      now: Date.now(),
      pendingResponse: pendingMapResponse,
    });
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function loadAllPointSets(pendingMapResponse) {
  showElement(mapLoadingOverlay);
  const loaded = await loadMapData(pendingMapResponse);
  hideElement(mapLoadingOverlay);
  return { pointSets: routePointSets(state.tours), loaded };
}

function showOverlays({ pointSets, loaded }) {
  const empty = hasNoPoints(pointSets);
  const failed = state.toursLoadFailed || !loaded;
  setVisible(mapLoadErrorOverlay, empty && failed);
  setVisible(mapEmptyOverlay, empty && !failed);
  renderPins();
}

export async function renderAllRoutes({ pendingMapResponse } = {}) {
  const { pointSets, loaded } = await loadAllPointSets(pendingMapResponse);
  renderRoutes(pointSets, ALL_TOURS_PADDING_PX);
  showOverlays({ pointSets, loaded });
}

// Every route, without touching pan/zoom: closing a tour's detail on desktop
// keeps the camera where it is; only "Show all tours" re-fits.
export async function redrawAllRoutesInPlace() {
  const { pointSets, loaded } = await loadAllPointSets();
  drawRoutes(pointSets);
  showOverlays({ pointSets, loaded });
}

// Mirrors the checked set while in select mode, falling back to all tours when
// nothing is checked so the map never goes blank.
export async function renderSelectedToursRoutes() {
  if (state.selectedIds.size === 0) {
    await renderAllRoutes();
    // A tour was checked while every route was loading.
    if (state.selectedIds.size !== 0) await renderSelectedToursRoutes();
    return;
  }
  const requested = selectionKey(state.selectedIds);
  const loaded = await loadMapData();
  if (selectionKey(state.selectedIds) !== requested) return;
  const pointSets = routePointSets(state.tours.filter((tour) => state.selectedIds.has(tour.id)));
  renderRoutes(pointSets, ALL_TOURS_PADDING_PX);
  showOverlays({ pointSets, loaded });
}
