# Dark and light mode from system settings — design

**Issue:** [#216](https://github.com/nobuddyorg/BikeBuddy/issues/216)
**Status:** Approved, ready for implementation plan

## Problem

The site is hardcoded to a single dark palette (`frontend/src/style.css` `:root`), and the map always loads the light CARTO "Voyager" basemap. Users whose OS is set to light mode get a dark site with a light map; there's no way to match the app to system appearance.

## Goals

- CSS chrome (background, surfaces, borders, text) follows the OS `prefers-color-scheme` automatically, no in-app toggle.
- The Leaflet basemap switches to a matching tile style (CARTO Dark Matter for dark, Voyager for light).
- If the OS theme changes while the app is open, both CSS and the map update live, without a reload.

## Non-goals

- No manual override toggle/persisted preference (explicitly system-only, per issue title).
- No change to heatmap gradient colors or photo-overlay scrim styling (`rgba(0,0,0,...)` overlays on photos/tooltips) — these are fixed-contrast overlays independent of site theme and stay as-is.
- No new locale strings or UI elements.

## Design

**CSS side:** `frontend/src/style.css` currently defines the (dark) palette directly in `:root`. Redefine `:root` with proper light-mode values (near-white background/surfaces, near-black text, light-gray borders), and move the current dark values into `@media (prefers-color-scheme: dark) { :root { ... } }`. Since all 117 color usages in the stylesheet already reference the `--color-*` custom properties, no other rule needs to change — the browser applies whichever block matches natively.

**Map side:** Leaflet tile URLs aren't reachable from CSS, so `frontend/src/app.js` needs a small JS-side switch:

```js
const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
};

function applyMapTheme(isDark) {
  tileLayer.setUrl(TILE_URLS[isDark ? 'dark' : 'light']);
}

const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
applyMapTheme(darkMediaQuery.matches);
darkMediaQuery.addEventListener('change', (e) => applyMapTheme(e.matches));
```

`L.tileLayer.setUrl()` swaps tiles in place on the existing layer — no need to remove/re-add it. The existing `attribution` option already credits both OpenStreetMap and CARTO and doesn't need to change between styles.

## Testing plan

- No new unit-testable pure logic (this is CSS + a one-line Leaflet call), so coverage is via Playwright:
  - Extend `e2e/tests` (static UI, no backend needed) with a test that uses `page.emulateMedia({ colorScheme: 'dark' })` before navigating, then asserts a computed style (e.g. `body` background color) matches the dark palette and the active tile image `src` contains `dark_all`.
  - Same test with `colorScheme: 'light'`, asserting the light palette and `voyager` tiles.
  - A third case: start with `'light'`, navigate, then call `page.emulateMedia({ colorScheme: 'dark' })` again without reloading, and assert both the CSS and the tile layer update live.
