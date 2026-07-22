# Mobile Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Superseded:** Task 1's sort-control approach below (narrow the native `<select>` to `width: auto`) was superseded mid-implementation by an icon button + popover menu, after a user clarification of the original brainstorming decision. See `docs/superpowers/specs/2026-07-21-mobile-improvements-design.md` §2 for the design that was actually built, and the `fix(mobile): replace shrunk sort select with an icon button + menu (#275)` commit for the implementation. This plan is left as-written below for historical record of Task 1's original CSS-only scope (header hide, search/sort row, map shrink); only the sort-control piece changed.

**Goal:** Recover mobile vertical space (drop the header row, combine search+sort into one row, shrink the map's floor) and replace the mobile Select button with a long-press gesture — all scoped to the existing `@media (max-width: 768px)` breakpoint; desktop stays untouched.

**Architecture:** Three independent CSS overrides land inside the existing mobile media query in `frontend/src/style.css` (no JS or HTML changes) — though the sort-control override was later revised to add a small JS/HTML popover component instead of a pure CSS resize; see the note above. A new `bindLongPress(el, onLongPress)` helper in `frontend/src/app.js`, built on Pointer Events, is wired into `createTourItem()` alongside its existing click handler — it works identically for touch (mobile) and mouse (desktop), so no viewport branching is needed in JS; only the CSS hides the button on mobile.

**Tech Stack:** Same as the rest of the repo — plain ES modules, Vitest for unit tests (none needed here), Playwright for e2e (full-stack suite).

## Global Constraints

- All CSS changes live inside the existing `@media (max-width: 768px) { ... }` block in `frontend/src/style.css` (starts at line 991) — nothing outside it changes, so desktop is provably untouched.
- `.map-container`'s mobile `min-height` goes from `40vh` to `20vh` (not fully hidden — the map stays visible by default).
- Long-press threshold: `500`ms hold, cancelled if the pointer moves more than `10`px (so list-scrolling never accidentally triggers it).
- Long-press is wired unconditionally (not gated to mobile in JS) — desktop keeps its visible `#btn-select-mode` button _and_ gains long-press as a bonus; only CSS hides the button on mobile.
- A long-press must enter select mode with the pressed tour already checked, and must suppress the trailing "ghost click" so the normal tap handler (`selectTour`/`toggleTourSelection`) does not also fire for that same gesture.
- No changes to `#272`'s selection bar, checkboxes, `Cancel` button, or `deleteSelectedTours()` — only how select mode is _entered_ changes.

---

## File Structure

- Modify `frontend/src/style.css` — mobile-only overrides for `.sidebar-header` (hide), `.tour-controls`/`.tour-search`/`.tour-sort` (row layout), `.map-container` (shrink).
- Modify `frontend/src/app.js` — new `bindLongPress()` helper, wired into `createTourItem()`.
- Modify `e2e/pages/main-page.ts` — a `longPressTour(name)` action reusing the existing tour-item locator pattern.
- Create `e2e/tests-fullstack/long-press-select.spec.ts` — full-stack e2e coverage for the long-press flow.

---

### Task 1: Mobile CSS layout changes

**Files:**

- Modify: `frontend/src/style.css`

**Interfaces:**

- Consumes: existing classes `.sidebar-header`, `.tour-controls`, `.tour-search`, `.tour-sort`, `.map-container` — no new class names introduced.
- Produces: nothing consumed by later tasks — this is a self-contained visual change, verified manually.

- [ ] **Step 1: Hide the sidebar header on mobile**

In `frontend/src/style.css`, inside the `@media (max-width: 768px) { ... }` block, replace:

```css
/* Sidebar is a scrollable strip above the map; give the tour list enough
     room to show several tours (the ⛶ button still expands the map full-screen). */
.sidebar {
  width: 100%;
  max-height: 55vh;
  border-right: none;
  border-bottom: 1px solid var(--color-border);
}

.map-container {
  flex: 1;
  min-height: 40vh;
}
```

with:

```css
/* Sidebar is a scrollable strip above the map; give the tour list enough
     room to show several tours (the ⛶ button still expands the map full-screen). */
.sidebar {
  width: 100%;
  max-height: 55vh;
  border-right: none;
  border-bottom: 1px solid var(--color-border);
}

/* No spare row for a title/count/Select-button header on mobile (#275) —
     select mode is entered by long-press instead (see bindLongPress in app.js). */
.sidebar-header {
  display: none;
}

/* Search and sort share one row instead of stacking, to save a row (#275).
     Sort stays a native <select> (no custom icon-menu) and just hugs its own
     content next to the search box, which takes the rest of the row. */
.tour-controls {
  flex-direction: row;
}

.tour-search {
  flex: 1;
}

.tour-sort {
  width: auto;
}

.map-container {
  flex: 1;
  /* Lowered from 40vh (#275): combined with the sidebar's 55vh cap, the old
       95vh floor left almost no slack inside calc(100vh - navbar-height). The
       map stays visible by default (not fully hidden) — only shrunk; the
       existing fullscreen toggle still expands it fully. */
  min-height: 20vh;
}
```

- [ ] **Step 2: Format and lint check**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy/functions
npx prettier --check --config .prettierrc.json '../frontend/src/*.{js,css,html}'
```

Expected: passes. If it reports formatting issues, run the equivalent `--write` command and re-check.

- [ ] **Step 3: Manual visual check**

Serve `frontend/src` statically (e.g. `cd frontend/src && python3 -m http.server 8080`) and open it in a browser resized to a mobile width (≤768px, e.g. 390×844):

1. The "My Tours" title/count/Select-button row is gone entirely.
2. The search box and sort dropdown sit on one row, search wider than sort.
3. The map is visibly shorter than before but still shows the heatmap/empty-state card by default (not blank).
4. Resize back above 768px: confirm all four elements look exactly as they did before this change (header row back, search/sort stacked, map at its original height).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/style.css
git commit -m "feat(mobile): drop header row, combine search+sort, shrink map (#275)"
```

---

### Task 2: Long-press to enter select mode

**Files:**

- Modify: `frontend/src/app.js`

**Interfaces:**

- Consumes: `state.selectMode`, `enterSelectMode()`, `toggleTourSelection(tourId)` (all pre-existing, from `#272`).
- Produces: `function bindLongPress(el: HTMLElement, onLongPress: () => void): void` — not exported, used only inside `createTourItem()`. No other task depends on new exports; Task 3 (e2e) drives it through the real UI, not by importing this function.

- [ ] **Step 1: Add the `bindLongPress` helper**

In `frontend/src/app.js`, directly above `function createTourItem(tour) {`, add:

```js
// Long-press (~500ms hold, cancelled by movement past a small tolerance)
// enters select mode with the pressed tour already checked — mobile's only
// entry point once the Select button is hidden there (#275). Wired
// unconditionally: Pointer Events unify touch and mouse under one path, so
// this also works as mouse click-and-hold on desktop, alongside its button.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

function bindLongPress(el, onLongPress) {
  let timer = null;
  let start = null;
  let fired = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    start = null;
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      fired = true;
      onLongPress();
    }, LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) cancel();
  });

  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);

  // Capture phase, so this runs before createTourItem's own bubble-phase
  // click listener — stopImmediatePropagation there suppresses the ghost
  // click the browser still fires after a long-press's pointerup, so a
  // long-press never also triggers the normal tap behavior.
  el.addEventListener(
    'click',
    (e) => {
      if (fired) {
        e.stopImmediatePropagation();
        fired = false;
      }
    },
    true,
  );
}
```

- [ ] **Step 2: Wire it into `createTourItem()`**

In `frontend/src/app.js`, replace:

```js
  li.append(checkbox, details);
  li.addEventListener('click', () => {
    if (state.selectMode) {
      toggleTourSelection(tour.id);
    } else {
      selectTour(tour.id);
    }
  });
  return li;
}
```

with:

```js
  li.append(checkbox, details);
  li.addEventListener('click', () => {
    if (state.selectMode) {
      toggleTourSelection(tour.id);
    } else {
      selectTour(tour.id);
    }
  });
  bindLongPress(li, () => {
    if (!state.selectMode) {
      enterSelectMode();
      toggleTourSelection(tour.id);
    }
  });
  return li;
}
```

- [ ] **Step 3: Lint check**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy
functions/node_modules/.bin/eslint --config functions/eslint.frontend.config.js frontend/src frontend/test
```

Expected: no errors.

- [ ] **Step 4: Format check**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy/functions
npx prettier --check --config .prettierrc.json '../frontend/*.js' '../frontend/src/*.{js,css,html}'
```

Expected: passes. If it reports formatting issues, run the equivalent `--write` command and re-check.

- [ ] **Step 5: Manual smoke check**

With the local dev stack running (`./buddy.sh development start-all`, requires Docker) and at least 2 tours present:

1. Press and hold a tour row for about a second (mouse: press and hold; touch/mobile emulation: touch and hold) → select mode activates, that tour's checkbox is checked, the selection bar shows "1 selected".
2. A normal quick click on a different, unselected tour (not in select mode) still opens its detail panel as before — long-press wiring did not change normal click behavior.
3. Click "Cancel" to exit select mode, then click-and-hold and release quickly (well under 500ms) → select mode does NOT activate, and the tour's detail panel opens instead (short click, not a long-press).
4. Press and hold, then drag the pointer more than ~10px before releasing (simulating an accidental scroll-start) → select mode does NOT activate.

Stop the stack after: `./buddy.sh development stop`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app.js
git commit -m "feat(mobile): long-press a tour to enter select mode (#275)"
```

---

### Task 3: E2E coverage for long-press

**Files:**

- Modify: `e2e/pages/main-page.ts`
- Create: `e2e/tests-fullstack/long-press-select.spec.ts`

**Interfaces:**

- Consumes: the real running app from Task 2. Also consumes `toursContainer()`, `clearTours()`, `clearUsers()` from `e2e/tests-fullstack/usersDb.ts` (existing helpers, same pattern as `photo-pins.spec.ts`/`multi-select-delete.spec.ts`).
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Add a `longPressTour` action to the page object**

In `e2e/pages/main-page.ts`, replace:

```ts
    selectTour(name: string): Promise<void>;
    closeDetail(): Promise<void>;
```

with:

```ts
    selectTour(name: string): Promise<void>;
    longPressTour(name: string): Promise<void>;
    closeDetail(): Promise<void>;
```

In `e2e/pages/main-page.ts`, replace:

```ts
    selectTour: async (name: string) => {
      await locators.list.container.locator('.tour-item', { hasText: name }).click();
    },
    closeDetail: async () => locators.buttons.closeDetail.click(),
```

with:

```ts
    selectTour: async (name: string) => {
      await locators.list.container.locator('.tour-item', { hasText: name }).click();
    },
    // Simulates a real press-and-hold: move the mouse over the row, press,
    // wait past the app's 500ms long-press threshold, then release — this
    // fires the same pointerdown/pointerup sequence a touch long-press would.
    longPressTour: async (name: string) => {
      const row = locators.list.container.locator('.tour-item', { hasText: name });
      const box = await row.boundingBox();
      if (!box) throw new Error(`tour row "${name}" not found`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
    },
    closeDetail: async () => locators.buttons.closeDetail.click(),
```

- [ ] **Step 2: Write the test**

Create `e2e/tests-fullstack/long-press-select.spec.ts`:

```ts
import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #275: long-press a tour row to enter select mode (mobile's replacement for
// the Select button), without disturbing normal short-click behavior.

buddyTest.describe('long-press to enter select mode', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    await toursContainer().items.create({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'local-dev-user',
      name: 'Long Press Tour A',
      distance: 5,
      createdAt: new Date(now).toISOString(),
    });
    await toursContainer().items.create({
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'local-dev-user',
      name: 'Long Press Tour B',
      distance: 5,
      createdAt: new Date(now - 60_000).toISOString(),
    });
  });

  buddyTest('a long press enters select mode with that tour checked', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.selection.bar).toBeHidden();

    await on(page).main.do.longPressTour('Long Press Tour A');

    await expect(on(page).main.locators.selection.bar).toBeVisible();
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');
    // The detail panel must NOT have opened — this was a long-press, not a tap.
    await expect(on(page).main.locators.detail.name).not.toBeVisible();
  });

  buddyTest(
    'a normal short click still opens the detail panel, not select mode',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.selectTour('Long Press Tour A');

      await expect(on(page).main.locators.detail.name).toHaveText('Long Press Tour A');
      await expect(on(page).main.locators.selection.bar).toBeHidden();
    },
  );

  buddyTest(
    'after a long press, select mode click-to-toggle still works normally',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.longPressTour('Long Press Tour A');
      await expect(on(page).main.locators.selection.count).toHaveText('1 selected');

      // A normal (short) click on a second tour, while already in select
      // mode, toggles it via the existing click handler — long-press didn't
      // break that path.
      await on(page).main.do.toggleTourSelection('Long Press Tour B');
      await expect(on(page).main.locators.selection.count).toHaveText('2 selected');
    },
  );
});
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd e2e && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the test**

Run: `cd e2e && npm run test:fullstack -- long-press-select.spec.ts` (requires the local stack: Cosmos emulator + Azurite + a running Functions host — start with `./buddy.sh development start-all` if not already running).
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Format check**

Run: `cd e2e && ./node_modules/.bin/prettier --check 'pages/main-page.ts' 'tests-fullstack/long-press-select.spec.ts'`
Expected: no issues. If it reports formatting problems, run the equivalent with `--write` and re-check.

- [ ] **Step 6: Commit**

```bash
git add e2e/pages/main-page.ts e2e/tests-fullstack/long-press-select.spec.ts
git commit -m "test(e2e): cover long-press select-mode entry (#275)"
```

---

## Final verification

- [ ] `cd frontend && npm test` — all unit tests pass (no regressions; this feature adds no new Vitest tests).
- [ ] `cd e2e && npm run test:fullstack` — full fullstack suite passes, including the new long-press tests.
- [ ] `prek run --all-files` (or on the changed files) — all hooks pass.
- [ ] Manual check in a real browser with the local stack running, at a mobile viewport width: the full flow from Task 1 Step 3 + Task 2 Step 5.
- [ ] Open a PR with `Fixes #275` in the body so it auto-closes on merge.
