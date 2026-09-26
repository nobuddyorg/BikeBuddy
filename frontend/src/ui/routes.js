import { queueMapDataLoads } from '../lib/mapData.js';
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

const ensureMapData = queueMapDataLoads();

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
  // Lines on the canvas renderer leave no element behind, so a test counts them here.
  map.getContainer().dataset.routeLines = String(lines.length);
  if (lines.length === 0) return;
  state.routeLayer = L.layerGroup(lines).addTo(map);
}

// Restyles in place, so dragging a slider neither rebuilds the layers nor moves the camera.
export function redrawRoutes() {
  state.routeLayer?.eachLayer((layer) => layer.setStyle(state.lineStyle));
}

function fitToPoints(pointSets, paddingPx) {
  const allPoints = pointSets.flat();
  if (allPoints.length === 0) return;
  // The container may have resized since Leaflet last measured it (mobile sidebar, toolbar).
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(allPoints), { padding: [paddingPx, paddingPx] });
}

export function renderRoutes(pointSets, paddingPx) {
  drawRoutes(pointSets);
  fitToPoints(pointSets, paddingPx);
}

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

// Closing a tour on desktop leaves the camera alone; only "Show all tours" re-fits.
export async function redrawAllRoutesInPlace() {
  const { pointSets, loaded } = await loadAllPointSets();
  drawRoutes(pointSets);
  showOverlays({ pointSets, loaded });
}

// Falls back to every tour when nothing is checked, so the map never goes blank.
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
