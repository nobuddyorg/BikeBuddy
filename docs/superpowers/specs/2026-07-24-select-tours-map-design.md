# Selecting tours drives the map — design

**Issue:** [#298](https://github.com/nobuddyorg/BikeBuddy/issues/298)
**Status:** Approved, ready for implementation plan

## Problem

Long-press already enters a checkbox multi-select mode (`state.selectMode` / `state.selectedIds` in `frontend/src/app.js`), but today it only feeds bulk delete — checking/unchecking tours has no effect on the map. There is no way to view the combined route for a chosen set of tours (1, 5, or all) via that mechanism, on desktop or mobile. Per the issue: reuse the existing multi-select mechanism for "just selecting tours [to view]," not only for deletion, and make it work the same on both platforms.

Single-tour selection via a normal tap (`selectTour()`) already filters the heatmap to one tour and opens the detail panel — that flow is unchanged by this work; on mobile the detail panel intentionally covers the screen and already has a working close button (`btn-close-detail` → `deselectTour()`).

## Goals

- While in select mode, checking/unchecking tours updates the map to show the combined heatmap of exactly the currently-checked tours.
- Works identically on desktop and mobile.
- Selecting 1 tour, 5 tours, or all tours all work via the same mechanism.
- No tours checked in select mode falls back to the existing "all tours" view rather than a blank map.
- Exiting select mode (Cancel, or after bulk delete completes) reverts the map to "all tours" — matches what bulk delete already does today.

## Non-goals

- No change to normal-tap behavior — it still opens the full detail panel for a single tour, unchanged.
- No mobile layout/CSS changes — the detail panel keeps covering the screen on mobile when open; that's existing, intentional behavior with an existing close action.
- No change to photo pin filtering (`geotaggedImages()` stays scoped to `state.selectedTourId`, i.e. the detail-panel tour) — out of scope for this issue, which is about the heatmap/route view.
- No i18n changes — existing strings ("Select" / "{count} selected" / "Delete" / "Cancel") already read generically, not "select to delete."

## Design

Add a helper in `frontend/src/app.js`, mirroring `renderAllHeatmap()`'s pattern but scoped to the checked set:

```js
async function renderSelectedToursHeatmap() {
  if (state.selectedIds.size === 0) {
    await renderAllHeatmap();
    return;
  }
  const tours = state.tours.filter((t) => state.selectedIds.has(t.id));
  await Promise.all(tours.map(ensureDetail));
  const points = tours.flatMap((t) => toHeatPoints(t.heatmapData));
  renderHeatmap(points, 40);
  show(elMapEmpty, points.length === 0);
  renderPins();
}
```

Wire it in:

- `toggleTourSelection()` (currently just mutates `state.selectedIds` and calls `renderSidebar()`) — call `renderSelectedToursHeatmap()` after `renderSidebar()`. This covers both the long-press entry path (`enterSelectMode()` + immediate `toggleTourSelection()`) and subsequent taps while already in select mode.
- `exitSelectMode()` — call `renderAllHeatmap()` after clearing `state.selectedIds`, replacing the current no-op on the map.

`deleteSelectedTours()` already calls `renderAllHeatmap()` unconditionally at the end regardless of success/failure mix, so no change needed there — it already matches the "revert to all tours" goal.

## Testing plan

- Extend `e2e/tests-fullstack/multi-select-delete.spec.ts` (or add a sibling spec) to seed several tours, enter select mode, check a subset, and assert the map/heatmap reflects only the checked tours — run under both a desktop and a mobile viewport, matching this repo's existing dual-viewport pattern for mobile-affecting changes.
- No new pure-logic unit tests expected — `renderSelectedToursHeatmap()` is thin glue over already-tested `renderHeatmap`/`toHeatPoints`/`ensureDetail`.
