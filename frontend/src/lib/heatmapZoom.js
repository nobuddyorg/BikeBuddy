'use strict';

// Leaflet.heat draws each point as a blob whose radius/blur are fixed CSS
// pixels that never scale with zoom. Zooming in spreads the same GPS samples
// further apart on screen, so past some zoom the blobs stop overlapping and
// the glow breaks into a chain of dots instead of a smooth tube — worse the
// higher a display's resolution, since a fixed pixel size covers proportionally
// less of the screen (#318). Below REFERENCE_ZOOM both are left untouched
// (that's the zoom range where it already looks right); above it, both grow
// to keep the tube solid. Blur grows faster and caps higher than radius so
// the glow spreads into a soft taper instead of a uniformly-saturated band
// (#318 follow-up).
const REFERENCE_ZOOM = 14;
const RADIUS_MAX_SCALE = 3;
const RADIUS_GROWTH = 1.5;
const BLUR_MAX_SCALE = 5;
const BLUR_GROWTH = 1.1;

function scaleAboveReference(zoom, growth, maxScale) {
  if (zoom <= REFERENCE_ZOOM) return 1;
  return Math.min(maxScale, 2 ** ((zoom - REFERENCE_ZOOM) / growth));
}

export function heatScaleForZoom(zoom) {
  return scaleAboveReference(zoom, RADIUS_GROWTH, RADIUS_MAX_SCALE);
}

function heatBlurScaleForZoom(zoom) {
  return scaleAboveReference(zoom, BLUR_GROWTH, BLUR_MAX_SCALE);
}

export function heatOptionsForZoom(zoom, baseOptions) {
  return {
    ...baseOptions,
    radius: baseOptions.radius * heatScaleForZoom(zoom),
    blur: baseOptions.blur * heatBlurScaleForZoom(zoom),
  };
}
