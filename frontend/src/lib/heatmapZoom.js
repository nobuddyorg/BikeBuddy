'use strict';

// Leaflet.heat draws each point as a blob whose radius/blur are fixed CSS
// pixels that never scale with zoom. Zooming in spreads the same GPS samples
// further apart on screen, so past some zoom the blobs stop overlapping and
// the glow breaks into a chain of dots instead of a smooth tube — worse the
// higher a display's resolution, since a fixed pixel size covers proportionally
// less of the screen (#318). Below REFERENCE_ZOOM the base radius/blur is left
// untouched (that's the zoom range where it already looks right); above it,
// both grow to keep the tube solid, capped so it doesn't turn into a blob.
const REFERENCE_ZOOM = 14;
const MAX_SCALE = 4;

export function heatScaleForZoom(zoom) {
  if (zoom <= REFERENCE_ZOOM) return 1;
  return Math.min(MAX_SCALE, 2 ** ((zoom - REFERENCE_ZOOM) / 2));
}

export function heatOptionsForZoom(zoom, baseOptions) {
  const scale = heatScaleForZoom(zoom);
  return { ...baseOptions, radius: baseOptions.radius * scale, blur: baseOptions.blur * scale };
}
