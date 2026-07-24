# Select Tours Drives the Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While in the sidebar's existing checkbox multi-select mode, checking/unchecking tours updates the map to show the combined route/heatmap of exactly the currently-checked tours — 1, 5, or all — identically on desktop and mobile.

**Architecture:** `state.selectMode`/`state.selectedIds` already exist and already drive per-row checkboxes and bulk delete (`frontend/src/app.js`). Add one new function, `renderSelectedToursHeatmap()`, that recomputes the heatmap from `state.selectedIds` (falling back to the existing "all tours" view when nothing is checked), and call it from the two places selection changes: `toggleTourSelection()` and `exitSelectMode()`. No new state, no new UI elements, no backend changes.

**Tech Stack:** Same as the rest of the repo — plain ES modules, Playwright for e2e (full-stack suite, since the static UI test config has no real tour data). No new Vitest unit tests — this is DOM/Leaflet wiring in `app.js`, which this repo already tests only via Playwright, not Vitest (see `frontend/test/*.test.js`, which covers only `frontend/src/lib/*.js` pure functions).

## Global Constraints

- No change to normal-tap behavior — `selectTour()`/`deselectTour()`/the detail panel/`#btn-close-detail` are untouched.
- No CSS, HTML, or i18n changes — the existing "Select"/"{count} selected"/"Delete"/"Cancel" strings and the mobile full-screen detail panel are unchanged (per the approved design's non-goals).
- No change to photo pin scoping — `geotaggedImages()` stays scoped to `state.selectedTourId` only; pins are out of scope for this issue.
- Reuse existing state only (`state.selectedIds`, `state.selectMode`) — no new state fields.

---

## File Structure

- Modify `frontend/src/app.js` — add `renderSelectedToursHeatmap()`; call it from `toggleTourSelection()` and `exitSelectMode()`.
- Modify `e2e/pages/main-page.ts` — add a `mapEmpty` locator (`#map-empty`), the only observable DOM signal of what the heatmap currently contains (Leaflet's canvas layer itself isn't inspectable from Playwright).
- Create `e2e/tests-fullstack/select-tours-map.spec.ts` — seeds one tour with heatmap data and one without, toggles selection between them, and asserts `#map-empty`'s visibility tracks exactly the checked set (visible only when the checked tours together have zero points).

---

### Task 1: Map follows checkbox selection

**Files:**

- Modify: `frontend/src/app.js`

**Interfaces:**

- Consumes: existing `state.selectedIds: Set<string>`, `state.tours`, `ensureDetail(tour): Promise<void>`, `toHeatPoints(heatmapData): [number, number, number][]`, `renderHeatmap(points, padding): void`, `renderAllHeatmap(): Promise<void>`, `show(el, visible): void`, `elMapEmpty`, `renderPins(): void` — all pre-existing in `frontend/src/app.js`.
- Produces: `renderSelectedToursHeatmap(): Promise<void>` — called from `toggleTourSelection()` and `exitSelectMode()`. Not consumed by Task 2; Task 2 only observes its effect via the `#map-empty` DOM element.

- [ ] **Step 1: Add `renderSelectedToursHeatmap()`**

In `frontend/src/app.js`, replace:

```js
async function renderAllHeatmap() {
  await Promise.all(state.tours.map(ensureDetail));
  const allPoints = state.tours.flatMap((t) => toHeatPoints(t.heatmapData));
  renderHeatmap(allPoints, 40);
  show(elMapEmpty, allPoints.length === 0);
  renderPins();
}
```

with:

```js
async function renderAllHeatmap() {
  await Promise.all(state.tours.map(ensureDetail));
  const allPoints = state.tours.flatMap((t) => toHeatPoints(t.heatmapData));
  renderHeatmap(allPoints, 40);
  show(elMapEmpty, allPoints.length === 0);
  renderPins();
}

// While in select mode, the map mirrors the checked set: 1 tour, 5 tours, or
// all of them (#298). Falls back to the all-tours view when nothing is
// checked, so the map never goes blank just because select mode is active.
async function renderSelectedToursHeatmap() {
  if (state.selectedIds.size === 0) {
    await renderAllHeatmap();
    return;
  }
  const tours = state.tours.filter((tour) => state.selectedIds.has(tour.id));
  await Promise.all(tours.map(ensureDetail));
  const points = tours.flatMap((t) => toHeatPoints(t.heatmapData));
  renderHeatmap(points, 40);
  show(elMapEmpty, points.length === 0);
  renderPins();
}
```

- [ ] **Step 2: Call it from `toggleTourSelection()`**

In `frontend/src/app.js`, replace:

```js
function toggleTourSelection(tourId) {
  if (state.selectedIds.has(tourId)) {
    state.selectedIds.delete(tourId);
  } else {
    state.selectedIds.add(tourId);
  }
  renderSidebar();
}
```

with:

```js
function toggleTourSelection(tourId) {
  if (state.selectedIds.has(tourId)) {
    state.selectedIds.delete(tourId);
  } else {
    state.selectedIds.add(tourId);
  }
  renderSidebar();
  renderSelectedToursHeatmap();
}
```

- [ ] **Step 3: Revert to "all tours" when select mode exits**

In `frontend/src/app.js`, replace:

```js
function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  renderSidebar();
}
```

with:

```js
function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  renderSidebar();
  renderAllHeatmap();
}
```

(`deleteSelectedTours()` already calls `renderAllHeatmap()` unconditionally at the end regardless of success/failure — no change needed there.)

- [ ] **Step 4: Run lint and format checks**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy
functions/node_modules/.bin/eslint --config functions/eslint.frontend.config.js frontend/src frontend/test
cd functions && npx prettier --check --config .prettierrc.json '../frontend/*.js' '../frontend/src/*.{js,css,html}' '../frontend/src/lib/**/*.js'
```

Expected: both pass. If Prettier reports formatting issues, run the equivalent `--write` command (same file globs) and re-check.

- [ ] **Step 5: Manual smoke check**

Run: `cd /Users/nicolemundhenke/Repos/BikeBuddy && ./buddy.sh development start-all` (requires Docker running; first run also needs `./buddy.sh development setup`). Wait for it to open `http://localhost:4280`.

With at least 2 tours already uploaded (different routes, e.g. via "Upload GPX"):

1. Click "Select" in the sidebar header → checkboxes appear, "0 selected" bar shows.
2. Check one tour → the map re-fits to show only that tour's route (matches what a normal tap on that same tour shows via the detail panel).
3. Check a second tour → the map re-fits to show both routes together.
4. Uncheck both → the map reverts to showing every tour's route (same as the "Show all" button).
5. Check one tour again, then click "Cancel" → the map still shows every tour's route (select mode exits, selection clears).

Stop the stack after: `./buddy.sh development stop`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app.js
git commit -m "feat: map follows checked tours in select mode (#298)"
```

---

### Task 2: E2E coverage

**Files:**

- Modify: `e2e/pages/main-page.ts`
- Create: `e2e/tests-fullstack/select-tours-map.spec.ts`

**Interfaces:**

- Consumes: the real running app from Task 1. Also consumes `toursContainer()`, `clearTours()`, `clearUsers()` from `e2e/tests-fullstack/usersDb.ts`, and the existing page-object actions `enterSelectMode()`, `toggleTourSelection(name)`, `cancelSelect()` (all already used by `multi-select-delete.spec.ts`).
- Produces: nothing consumed elsewhere — this is the last task.

**Note on viewport:** unlike prior mobile-affecting changes, this fix adds no viewport-conditional code — `renderSelectedToursHeatmap()` runs identically regardless of screen size, and select mode is entered via the same `toggleTourSelection()` call whether triggered by the "Select" button (desktop) or long-press (mobile, already covered by existing long-press tests). A single default-viewport test fully exercises the new logic; a duplicate mobile-viewport run would add no signal.

- [ ] **Step 1: Add a `mapEmpty` locator**

In `e2e/pages/main-page.ts`, replace:

```ts
  locators: {
    map: Locator;
    userMenu: Locator;
```

with:

```ts
  locators: {
    map: Locator;
    mapEmpty: Locator;
    userMenu: Locator;
```

In `e2e/pages/main-page.ts`, replace:

```ts
  const locators = {
    map: page.locator('#map'),
    userMenu: page.locator('#user-menu'),
```

with:

```ts
  const locators = {
    map: page.locator('#map'),
    mapEmpty: page.locator('#map-empty'),
    userMenu: page.locator('#user-menu'),
```

- [ ] **Step 2: Write the test**

Create `e2e/tests-fullstack/select-tours-map.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #298: checking/unchecking tours in select mode must update the map to
// show exactly the checked set. #map-empty is the only DOM-observable proxy
// for "does the current heatmap have any points" (Leaflet's canvas heat
// layer itself isn't inspectable from Playwright) — one tour has heatmap
// data and the other doesn't, so toggling between them flips #map-empty
// precisely when the map is scoped correctly.

const TID_WITH_DATA = randomUUID();
const TID_NO_DATA = randomUUID();

buddyTest.describe('selecting tours drives the map', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    await toursContainer().items.create({
      id: TID_WITH_DATA,
      userId: 'local-dev-user',
      name: 'MapSelect Tour With Data',
      distance: 5,
      createdAt: new Date().toISOString(),
      heatmapData: [
        [48.1, 11.5],
        [48.11, 11.51],
      ],
    });
    await toursContainer().items.create({
      id: TID_NO_DATA,
      userId: 'local-dev-user',
      name: 'MapSelect Tour No Data',
      distance: 5,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
  });

  buddyTest('map reflects exactly the checked tours', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.count).toHaveText('2');

    // All tours (nothing selected yet): the data tour has points → not empty.
    await expect(on(page).main.locators.mapEmpty).toBeHidden();

    await on(page).main.do.enterSelectMode();
    await expect(on(page).main.locators.selection.count).toHaveText('0 selected');

    // Check only the no-data tour: the map is scoped to just it → empty.
    await on(page).main.do.toggleTourSelection('MapSelect Tour No Data');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');
    await expect(on(page).main.locators.mapEmpty).toBeVisible();

    // Also check the data tour: combined set has points again → not empty.
    await on(page).main.do.toggleTourSelection('MapSelect Tour With Data');
    await expect(on(page).main.locators.selection.count).toHaveText('2 selected');
    await expect(on(page).main.locators.mapEmpty).toBeHidden();

    // Uncheck the data tour: back to only the no-data tour → empty again,
    // proving the map updates live on every toggle, not just once.
    await on(page).main.do.toggleTourSelection('MapSelect Tour With Data');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');
    await expect(on(page).main.locators.mapEmpty).toBeVisible();

    // Uncheck the last tour too: 0 selected, still in select mode (bar
    // stays up) — the map must fall back to the all-tours view rather than
    // staying empty just because nothing is checked.
    await on(page).main.do.toggleTourSelection('MapSelect Tour No Data');
    await expect(on(page).main.locators.selection.count).toHaveText('0 selected');
    await expect(on(page).main.locators.selection.bar).toBeVisible();
    await expect(on(page).main.locators.mapEmpty).toBeHidden();

    // Re-check the no-data tour so cancelling below also proves the exit
    // path reverts the map, not just the empty-selection fallback.
    await on(page).main.do.toggleTourSelection('MapSelect Tour No Data');
    await expect(on(page).main.locators.mapEmpty).toBeVisible();

    // Cancel select mode: reverts to the all-tours view → not empty.
    await on(page).main.do.cancelSelect();
    await expect(on(page).main.locators.selection.bar).toBeHidden();
    await expect(on(page).main.locators.mapEmpty).toBeHidden();
  });
});
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd e2e && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the test**

Run: `cd e2e && npm run test:fullstack -- select-tours-map.spec.ts` (requires the local stack: Cosmos emulator + Azurite + a running Functions host — start with `./buddy.sh development start-all` if not already running).
Expected: PASS.

- [ ] **Step 5: Format check**

Run: `cd e2e && ./node_modules/.bin/prettier --check 'pages/main-page.ts' 'tests-fullstack/select-tours-map.spec.ts'`
Expected: no issues. If it reports formatting problems, run the equivalent with `--write` and re-check.

- [ ] **Step 6: Commit**

```bash
git add e2e/pages/main-page.ts e2e/tests-fullstack/select-tours-map.spec.ts
git commit -m "test(e2e): cover map following checked tours in select mode (#298)"
```

---

## Final verification

- [ ] `cd frontend && npm test` — all unit tests pass (no regressions; this feature adds no new Vitest tests).
- [ ] `cd e2e && npm run test:fullstack` — full fullstack suite passes, including the new `select-tours-map.spec.ts`.
- [ ] `prek run --all-files` (or on the changed files) — all hooks pass.
- [ ] Manual check in a real browser with the local stack running: Task 1 Step 5's flow, plus confirm normal single-tap tour selection (detail panel) still works unchanged, on both desktop width and a narrow/mobile width.
- [ ] Open a PR with `Fixes #298` in the body so it auto-closes on merge.
