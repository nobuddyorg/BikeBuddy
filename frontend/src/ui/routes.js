'use strict';

import { ensureMapData } from '../lib/mapData.js';
import { state } from './state.js';
import { map } from './map.js';
import { show, elMapEmpty, elMapLoading } from './dom.js';
import { apiFetch } from './auth.js';
import { renderPins } from './pins.js';

const L = window.L;

export function clearRouteLayer() {
  if (state.routeLayer) {
    map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
}

// One polyline per tour, so tours never get joined by a spurious segment
// across the gap between them the way a single flattened point list would.
function drawRoutes(pointSets) {
  clearRouteLayer();
  const lines = pointSets
    .filter((pts) => pts.length > 1)
    .map((pts) => L.polyline(pts, state.lineStyle));
  if (lines.length === 0) return;
  state.routeLayer = L.layerGroup(lines).addTo(map);
}

// Redraws the last-rendered tours in the current style without touching
// pan/zoom, so changing color/width/opacity doesn't re-fit the map.
export function redrawRoutes() {
  drawRoutes(state.routePointSets);
}

export function renderRoutes(pointSets, padding) {
  state.routePointSets = pointSets;
  drawRoutes(pointSets);
  const allPoints = pointSets.flat();
  if (allPoints.length === 0) return;
  map.fitBounds(L.latLngBounds(allPoints), { padding: [padding, padding] });
}

export async function renderAllRoutes(mapDataPromise) {
  show(elMapLoading, true);
  await ensureMapData(apiFetch, state.tours, mapDataPromise);
  show(elMapLoading, false);
  const pointSets = state.tours.map((t) => t.heatmapData || []);
  renderRoutes(pointSets, 40);
  show(
    elMapEmpty,
    pointSets.every((pts) => pts.length === 0),
  );
  renderPins();
}

// Mirrors the checked set while in select mode, falling back to all tours when
// nothing is checked so the map never goes blank.
export async function renderSelectedToursRoutes() {
  if (state.selectedIds.size === 0) {
    await renderAllRoutes();
    if (state.selectedIds.size !== 0) return renderSelectedToursRoutes();
    return;
  }
  const requested = [...state.selectedIds].sort().join(',');
  const tours = state.tours.filter((tour) => state.selectedIds.has(tour.id));
  await ensureMapData(apiFetch, state.tours);
  if ([...state.selectedIds].sort().join(',') !== requested) return; // selection changed while loading
  const pointSets = tours.map((t) => t.heatmapData || []);
  renderRoutes(pointSets, 40);
  show(
    elMapEmpty,
    pointSets.every((pts) => pts.length === 0),
  );
  renderPins();
}
