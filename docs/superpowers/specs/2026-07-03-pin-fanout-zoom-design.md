# Zoom-aware photo pin fan-out — design

**Issue:** [#210](https://github.com/nobuddyorg/BikeBuddy/issues/210)
**Status:** Approved, ready for implementation plan

## Problem

Co-located photo pins already fan out (`frontend/src/app.js` `groupByLocation`/`fanOffsets`, from #126), but both the grouping threshold (~4 decimal degrees ≈ 11m) and the fan radius (`0.0002` degrees) are fixed in **geographic** units. Per the issue's own follow-up comment: "this works when zooming in a lot already. should be working on more zoom levels" — at low zoom, a few meters of real-world separation is sub-pixel on screen, so pins still visually overlap. There's also no re-render on zoom, so positions never adjust as the user zooms.

## Goals

- Pins that visually overlap on screen fan out into a small clickable arc, at any zoom level.
- Pins that are far enough apart on screen (even if physically close) render at their real position, ungrouped.
- Zooming in/out re-evaluates grouping so pins separate/re-collapse live.
- Stays on the existing Leaflet layer — no new map library.

## Non-goals

- No change to marker click behavior (still opens the lightbox) or icon appearance.
- No re-grouping on pan — grouping only depends on zoom (see Design), not viewport position.

## Design

**Pixel-space instead of degree-space.** `map.project(latlng, zoom)` converts a geographic coordinate to an absolute pixel point for a given zoom level, independent of current pan/viewport — exactly the primitive needed for a zoom-relative, pan-independent threshold.

`renderPins()` (`frontend/src/app.js`):

1. For each geotagged photo, compute `map.project([lat, lon], map.getZoom())` → a pixel point.
2. Group photos whose pixel points are within `GROUP_THRESHOLD_PX = 24` of each other (roughly the 36px pin icon's radius).
3. For each group of size > 1, compute a small circular fan of pixel offsets (`FAN_RADIUS_PX = 16`) around the group.
4. Convert each fanned pixel point back to a lat/lon via `map.unproject(point, zoom)` and place the marker there.
5. A new `map.on('zoomend', renderPins)` listener (added once, near the existing pin-rendering code) re-runs this whole pipeline whenever the zoom level changes; `renderPins` already no-ops when the toggle is off.

**Extraction for testability:** the two pure pieces — proximity grouping and circular fan-offset math — operate purely on `{x, y}` pixel numbers, no Leaflet/DOM involved. They move out of `app.js` into a new `frontend/src/lib/pinLayout.js`:

```js
// Groups points whose pixel distance to some existing group member is <= thresholdPx.
export function groupByProximity(points, thresholdPx) { ... }

// Returns `n` [dx, dy] pixel offsets arranged in a circle of the given radius.
// n <= 1 returns [[0, 0]] (no offset needed for an ungrouped pin).
export function fanOffsets(n, radiusPx) { ... }
```

This replaces the current `groupByLocation` (degree-rounding) and `fanOffsets` (degree-radius) in `app.js`, which are removed.

## Testing plan

- Unit tests (`frontend/test/pinLayout.test.js`): `groupByProximity` (points within/outside threshold, chained proximity, empty input) and `fanOffsets` (n=1 returns `[[0,0]]`, n>1 returns `n` distinct offsets each at distance `radiusPx` from origin).
- The existing e2e test (`e2e/tests-fullstack/photo-pins.spec.ts`) already covers two photos at the _exact same_ coordinate — distance 0 always groups, so this keeps passing unchanged.
- New/extended e2e coverage: zoom out on a tour with two nearby-but-not-identical geotagged photos and confirm they render as one visual cluster (still 2 clickable markers via the fan, not 1), then zoom in and confirm `zoomend` re-renders without losing markers.
