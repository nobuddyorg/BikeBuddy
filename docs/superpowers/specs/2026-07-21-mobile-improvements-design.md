# Mobile improvements — design

**Issue:** [#275](https://github.com/nobuddyorg/BikeBuddy/issues/275)
**Status:** Approved, ready for implementation plan

## Problem

On mobile, the sidebar is a scrollable strip capped at `55vh` above a map that's forced to a `40vh` floor (`frontend/src/style.css:998-1008`) — together that's a `95vh` minimum inside a `calc(100vh - navbar-height)` container, leaving almost no slack. The issue's author (who is also the person who requested and uses the #272 multi-select feature) proposed four concrete space-saving changes and asked to discuss them before anything gets built.

## Goals

- Recover meaningful vertical space on mobile without losing the app's core visual (the map).
- Keep desktop completely unchanged — this is a mobile-only pass, discussed and confirmed as in-scope only under the existing `@media (max-width: 768px)` breakpoint.
- Replace the mobile multi-select entry point (the `#btn-select-mode` button, shipped in #272) with a long-press gesture, since there's no spare row for a button once the header row is gone.

## Non-goals

- No changes to desktop layout, sizing, or the desktop `Select` button — it stays exactly as #272 shipped it.
- No custom icon-triggered dropdown to replace the native tour-sort `<select>` — discussed and rejected as more complexity than the space saved justifies; the native select just shrinks to fit its content instead.
- No fully-hidden-by-default map — discussed and rejected; the map shrinks but stays visible, since making BikeBuddy's core feature invisible by default was judged not worth the extra space.
- No keyboard equivalent for long-press. This mirrors an existing gap (tour rows have no keyboard interaction story today) rather than introducing a new regression, but is worth naming as a known limitation.

## Design

### 1. Header row removal (mobile)

`.sidebar-header` (`frontend/src/index.html`, the "My Tours" title + count badge + `#btn-select-mode`) gets a `display: none` override inside the mobile media query. This is a pure CSS change — no JS needs to know about viewport — and conveniently removes the Select button too, since mobile's only entry into select mode becomes long-press (see §4).

### 2. Search + sort share one row (mobile)

`.tour-controls` switches from `flex-direction: column` to `row` under the mobile media query. `.tour-search` gets `flex: 1` so it takes the remaining space; `.tour-sort` gets `width: auto` (dropping its stretch) so the native `<select>` just hugs its own content next to the search box.

### 3. Map shrinks, doesn't hide (mobile)

`.map-container`'s `min-height` drops from `40vh` to `20vh` under the mobile media query (`frontend/src/style.css:1005-1008`). Combined with the sidebar's existing `55vh` cap, the mobile layout's floor goes from `95vh` to `75vh`, which is where the actual space win comes from — the heatmap stays visibly present by default, and the existing fullscreen toggle (`#btn-map-expand`, already positioned next to the pins toggle since #274) still expands it fully.

### 4. Long-press replaces the Select button (mobile-visible, wired everywhere)

A ~500ms hold on any `.tour-item`, cancelled if the pointer moves more than ~10px (so list-scrolling on mobile never accidentally triggers it), enters select mode with that tour immediately checked — matching the common "long-press to multi-select" pattern (e.g. Photos apps).

Implementation: a small `bindLongPress(el, onLongPress)` helper using Pointer Events (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`/`pointerleave`), which unifies touch and mouse under one code path — so this works via touch on mobile and via mouse click-and-hold on desktop, with no viewport branching in JS at all. Desktop keeps the button visible (only hidden via the mobile media query per §1) _and_ gets long-press as a harmless bonus affordance; mobile loses the button and relies on long-press alone.

The tricky part is suppressing the "ghost click" the browser still fires after a long-press's `pointerup` — handled with a capture-phase `click` listener that calls `e.stopImmediatePropagation()` when a long-press just fired, so the existing bubble-phase click handler (which does `selectTour`/`toggleTourSelection`) never runs for that gesture. This lives alongside `createTourItem()`, wired in without changing that function's existing click-handling logic.

No changes to the selection bar, checkboxes, `Cancel` button, or `deleteSelectedTours()` — #272's select-mode UI and bulk-delete flow are untouched; only how mobile _enters_ select mode changes.

## Testing plan

- No new pure-logic unit tests — this is CSS responsive behavior plus a DOM gesture helper, consistent with this repo's existing convention (`frontend/test/*.test.js` covers only `frontend/src/lib/*.js` pure functions).
- Full-stack e2e coverage for the long-press flow: Playwright can simulate it with `page.mouse.move()` + `page.mouse.down()` + a `waitForTimeout` past the 500ms threshold + `page.mouse.up()`, then assert select mode is active with the pressed tour checked, and that a normal short click still opens the detail panel instead. Sized in the implementation plan.
- Manual/visual verification of the three CSS changes (same approach used for the recent z-index and pin-toggle fixes) — resize to a mobile viewport and confirm the header is gone, search+sort share a row, and the map's shrunk floor renders correctly.
