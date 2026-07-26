'use strict';

// leaflet.heat's radius and blur are fixed CSS pixels. Zooming in spreads the
// same GPS samples further apart, so past a point the blobs stop overlapping and
// the track breaks into a chain of dots — worse on high-resolution displays,
// where a fixed pixel size covers proportionally less (#318). Below
// REFERENCE_ZOOM it already looks right; above it both grow, capped.
const REFERENCE_ZOOM = 14;
const MAX_SCALE = 3;

export function heatScaleForZoom(zoom) {
  if (zoom <= REFERENCE_ZOOM) return 1;
  return Math.min(MAX_SCALE, 2 ** ((zoom - REFERENCE_ZOOM) / 1.5));
}

export function heatOptionsForZoom(zoom, baseOptions) {
  const scale = heatScaleForZoom(zoom);
  return { ...baseOptions, radius: baseOptions.radius * scale, blur: baseOptions.blur * scale };
}
