# Zoom-Aware Pin Fan-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Co-located photo pins fan out and re-collapse correctly at every zoom level, not just when zoomed in close.

**Architecture:** Replace the current fixed-degree grouping/fan-out in `frontend/src/app.js` with pixel-space math (`map.project`/`map.unproject`) re-evaluated on every `zoomend`. The pure grouping/fan math moves to a new `frontend/src/lib/pinLayout.js` for unit testing.

**Tech Stack:** Same as the rest of the repo — plain ES modules, Leaflet (already loaded), Vitest.

## Global Constraints

- No new map library — stays on the existing Leaflet layer/markers.
- Grouping threshold: 24px. Fan radius: 16px. Both in screen-pixel space, not degrees.
- Re-render pins on `zoomend` (not on pan — grouping only depends on zoom).
- Marker click behavior (opens lightbox) is unchanged.

---

## File Structure

- Create `frontend/src/lib/pinLayout.js` — pure `groupByProximity` + `fanOffsets`.
- Create `frontend/test/pinLayout.test.js` — unit tests for both.
- Modify `frontend/src/app.js` — replace `groupByLocation`/`fanOffsets`/`makePinMarker` usage in the "Photo pins" section with pixel-space logic + a `zoomend` listener.
- Modify `e2e/tests-fullstack/photo-pins.spec.ts` — extend the existing co-located-pins test to zoom out and confirm pins survive re-render.
- Modify `e2e/pages/main-page.ts` — add a zoom-out action.

---

### Task 1: Pure grouping and fan-offset math

**Files:**

- Create: `frontend/src/lib/pinLayout.js`
- Test: `frontend/test/pinLayout.test.js`

**Interfaces:**

- Produces: `export function groupByProximity(points, thresholdPx)` — `points` is `Array<{x: number, y: number, [k: string]: unknown}>` (extra fields like `img` pass through untouched); returns `Array<Array<point>>`, each inner array a group whose members are all within `thresholdPx` pixel distance of at least one other member of the same group.
- Produces: `export function fanOffsets(n, radiusPx)` — returns `n` `[dx, dy]` pixel-offset pairs arranged evenly around a circle of radius `radiusPx`; `n <= 1` returns `[[0, 0]]`.

- [ ] **Step 1: Write the failing test**

Create `frontend/test/pinLayout.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { groupByProximity, fanOffsets } from '../src/lib/pinLayout.js';

describe('groupByProximity', () => {
  it('returns an empty array for no points', () => {
    expect(groupByProximity([], 24)).toEqual([]);
  });

  it('keeps far-apart points in separate groups', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 100 };
    expect(groupByProximity([a, b], 24)).toEqual([[a], [b]]);
  });

  it('groups points within the threshold', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(groupByProximity([a, b], 24)).toEqual([[a, b]]);
  });

  it('chains proximity transitively through a shared neighbor', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 20, y: 0 }; // within 24px of a
    const c = { x: 40, y: 0 }; // within 24px of b, not of a (distance 40)
    expect(groupByProximity([a, b, c], 24)).toEqual([[a, b, c]]);
  });
});

describe('fanOffsets', () => {
  it('returns a single zero offset for n <= 1', () => {
    expect(fanOffsets(0, 16)).toEqual([[0, 0]]);
    expect(fanOffsets(1, 16)).toEqual([[0, 0]]);
  });

  it('returns n offsets each at the given radius from the origin', () => {
    const offsets = fanOffsets(4, 16);
    expect(offsets).toHaveLength(4);
    for (const [dx, dy] of offsets) {
      expect(Math.hypot(dx, dy)).toBeCloseTo(16, 5);
    }
  });

  it('spreads offsets to distinct positions', () => {
    const offsets = fanOffsets(3, 10);
    const unique = new Set(offsets.map(([dx, dy]) => `${dx.toFixed(3)},${dy.toFixed(3)}`));
    expect(unique.size).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/pinLayout.test.js`
Expected: FAIL — cannot find module `../src/lib/pinLayout.js`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/pinLayout.js`:

```js
'use strict';

// Groups points whose pixel distance to some existing group member is
// <= thresholdPx. Single pass: each point joins the first group containing
// a member within threshold, else starts a new group. Good enough for the
// small number of geotagged photos typically visible in one viewport.
export function groupByProximity(points, thresholdPx) {
  const groups = [];
  for (const point of points) {
    const group = groups.find((g) =>
      g.some((p) => Math.hypot(p.x - point.x, p.y - point.y) <= thresholdPx),
    );
    if (group) group.push(point);
    else groups.push([point]);
  }
  return groups;
}

// Returns `n` [dx, dy] pixel offsets arranged evenly around a circle of the
// given radius. A single point needs no offset.
export function fanOffsets(n, radiusPx) {
  if (n <= 1) return [[0, 0]];
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return [radiusPx * Math.cos(angle), radiusPx * Math.sin(angle)];
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run test/pinLayout.test.js`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/pinLayout.js frontend/test/pinLayout.test.js
git commit -m "feat: add pixel-space pin grouping/fan-out math (#210)"
```

---

### Task 2: Wire pixel-space grouping into `renderPins`

**Files:**

- Modify: `frontend/src/app.js:5` (imports)
- Modify: `frontend/src/app.js:502-568` (the "Photo pins" section)

**Interfaces:**

- Consumes: `groupByProximity`, `fanOffsets` from Task 1.
- Produces: no new exports. `renderPins()` keeps its existing no-argument signature and existing callers (`renderAllHeatmap`, `selectTour`, after image upload) are unaffected.

DOM/Leaflet-glue-only, no Vitest coverage for this task itself — verified by the e2e test in Task 3 and a manual check.

- [ ] **Step 1: Add the import**

In `frontend/src/app.js`, add a new import line after the existing `files.js`/`concurrency.js` imports (after line 10, the `import * as i18n from './lib/i18n.js';` line... actually insert right after the other named imports at the top, e.g. after line 5's block):

```js
import { groupByProximity, fanOffsets } from './lib/pinLayout.js';
```

- [ ] **Step 2: Replace the Photo pins section**

Replace the entire block from the `// ── Photo pins (#100) ──` comment through the end of `renderPins()`'s closing `}` (currently lines 502-568) with:

```js
// ── Photo pins (#100, #210) ─────────────────────────────────────────────────

const PIN_GROUP_THRESHOLD_PX = 24;
const PIN_FAN_RADIUS_PX = 16;

// Geotagged images across all loaded tours (lat/lon come from the detail fetch).
function geotaggedImages() {
  return state.tours.flatMap((t) =>
    (t.images || []).filter((img) => typeof img.lat === 'number' && typeof img.lon === 'number'),
  );
}

function photoPinIcon(url) {
  return L.divIcon({
    className: 'photo-pin',
    html: `<img src="${url}" alt="Tour photo" />`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function clearPins() {
  if (state.pinLayer) {
    map.removeLayer(state.pinLayer);
    state.pinLayer = null;
  }
}

function makePinMarker(img, latlng) {
  const marker = L.marker(latlng, { icon: photoPinIcon(img.url) });
  marker.on('click', () => openLightbox(img.url));
  return marker;
}

// The toggle is hidden unless some photo has coordinates; the layer is only
// added when the toggle is on (default off, per #100). Grouping/fanning
// happens in screen-pixel space at the current zoom (#210), so pins that
// visually overlap fan out, and separate/re-collapse live as the user zooms
// (re-triggered by the zoomend listener below).
function renderPins() {
  clearPins();
  const images = geotaggedImages();
  show(elPinToggle, images.length > 0);
  if (!state.showPins || images.length === 0) return;

  const zoom = map.getZoom();
  const points = images.map((img) => {
    const { x, y } = map.project([img.lat, img.lon], zoom);
    return { x, y, img };
  });

  const markers = groupByProximity(points, PIN_GROUP_THRESHOLD_PX).flatMap((group) => {
    const offsets = fanOffsets(group.length, PIN_FAN_RADIUS_PX);
    return group.map((point, i) => {
      const [dx, dy] = offsets[i];
      const latlng = map.unproject([point.x + dx, point.y + dy], zoom);
      return makePinMarker(point.img, latlng);
    });
  });
  state.pinLayer = L.layerGroup(markers).addTo(map);
}

map.on('zoomend', renderPins);
```

- [ ] **Step 3: Lint and format**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy
functions/node_modules/.bin/eslint --config functions/eslint.frontend.config.js frontend/src frontend/test
cd functions && npx prettier --check --config .prettierrc.json '../frontend/*.js' '../frontend/src/*.{js,css,html}' '../frontend/src/lib/**/*.js' '../frontend/test/**/*.js'
```

Expected: no errors from either command.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app.js
git commit -m "feat: fan out and re-group photo pins in pixel space on zoom (#210)"
```

---

### Task 3: E2E coverage for zoom re-render

**Files:**

- Modify: `e2e/pages/main-page.ts`
- Modify: `e2e/tests-fullstack/photo-pins.spec.ts`

**Interfaces:**

- Consumes: the real running app from Tasks 1-2 (Leaflet's default `.leaflet-control-zoom-out` button).
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Add a zoom-out action to the page object**

In `e2e/pages/main-page.ts`, add to the `MainPage` interface's `do` block (after `showPins`):

```ts
    zoomOut(times: number): Promise<void>;
```

Add to the `locators` interface's `map`-adjacent section — add a new top-level `mapControls` entry after `pins`:

```ts
mapControls: {
  zoomOut: Locator;
}
```

In the `locators` object literal, add after the `pins` entry:

```ts
    mapControls: {
      zoomOut: page.locator('.leaflet-control-zoom-out'),
    },
```

In the `interactions` object, add after `showPins`:

```ts
    zoomOut: async (times: number) => {
      for (let i = 0; i < times; i++) {
        await locators.mapControls.zoomOut.click();
      }
    },
```

- [ ] **Step 2: Extend the existing co-located-pins test**

In `e2e/tests-fullstack/photo-pins.spec.ts`, replace the test body (currently lines 36-55) — keep everything through `await expect(on(page).main.locators.pins.markers).toHaveCount(2);` (the "Turn on" assertion) unchanged, then replace the final "Turn off" block with an added zoom step before it:

```ts
buddyTest(
  'toggle off by default; reveals both co-located pins fanned out',
  async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.container).toContainText('Geotagged Tour');

    // Toggle visible (geotagged images exist) but off → no pins.
    await expect(on(page).main.locators.pins.toggle).toBeVisible();
    await expect(on(page).main.locators.pins.toggleInput).not.toBeChecked();
    await expect(on(page).main.locators.pins.markers).toHaveCount(0);

    // Turn on → both co-located pins appear (fanned, each clickable).
    await on(page).main.do.showPins(true);
    await expect(on(page).main.locators.pins.markers).toHaveCount(2);

    // Zoom out several steps (#210): the zoomend listener must re-run
    // grouping/fan-out without losing either marker.
    await on(page).main.do.zoomOut(6);
    await expect(on(page).main.locators.pins.markers).toHaveCount(2);

    // Turn off → pins removed.
    await on(page).main.do.showPins(false);
    await expect(on(page).main.locators.pins.markers).toHaveCount(0);
  },
);
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd e2e && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the test**

Run: `cd e2e && npm run test:fullstack -- photo-pins.spec.ts` (requires the local stack: Cosmos emulator + Azurite + a running Functions host).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/pages/main-page.ts e2e/tests-fullstack/photo-pins.spec.ts
git commit -m "test(e2e): cover pin fan-out surviving a zoom re-render (#210)"
```

---

## Final verification

- [ ] `cd frontend && npm test` — all unit tests pass, including new `pinLayout.test.js`.
- [ ] `prek run --all-files` (or on the changed files) — all hooks pass.
- [ ] Manual check in a real browser: a tour with 2+ geotagged photos a few tens of meters apart — at the tour's default (zoomed-in) view they may render separately; zoom out with the map's `−` control and confirm they visually converge into a small fanned cluster, still both clickable, instead of overlapping into one unclickable stack.
- [ ] Open a PR with `Fixes #210` in the body so it auto-closes on merge.
