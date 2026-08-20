'use strict';

import { ensureMapData } from '../lib/mapData.js';
import { state } from './state.js';
import { map } from './map.js';
import { show, elMapEmpty, elMapLoadError, elMapLoading } from './dom.js';
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
    .map((pts) => L.polyline(pts, { ...state.lineStyle, interactive: false }));
  if (lines.length === 0) return;
  state.routeLayer = L.layerGroup(lines).addTo(map);
}

// Applies the current line style to the already-drawn polylines in place —
// no layer teardown/rebuild and no pan/zoom change, so a slider drag stays
// smooth instead of re-creating every polyline on each tick.
export function redrawRoutes() {
  state.routeLayer?.eachLayer((layer) => layer.setStyle(state.lineStyle));
}

export function renderRoutes(pointSets, padding) {
  state.routePointSets = pointSets;
  drawRoutes(pointSets);
  const allPoints = pointSets.flat();
  if (allPoints.length === 0) return;
  // Tours finish loading asynchronously, by which point the container may
  // have resized (mobile sidebar settling, address-bar collapsing) since
  // Leaflet last measured it — fitBounds would otherwise center against that
  // stale size and leave the map visibly panned off.
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(allPoints), { padding: [padding, padding] });
}

export async function renderAllRoutes(mapDataPromise) {
  show(elMapLoading, true);
  await ensureMapData(apiFetch, state.tours, mapDataPromise);
  show(elMapLoading, false);
  const pointSets = state.tours.map((t) => t.heatmapData || []);
  renderRoutes(pointSets, 40);
  const empty = pointSets.every((pts) => pts.length === 0);
  show(elMapLoadError, empty && state.toursLoadFailed);
  show(elMapEmpty, empty && !state.toursLoadFailed);
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
