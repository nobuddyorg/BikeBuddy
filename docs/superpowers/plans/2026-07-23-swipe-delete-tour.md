# Swipe-to-delete a tour + icon-only selection buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user swipe a tour row (left or right, touch only) to delete that single tour, with a delete-icon layer revealed behind the row as visual feedback, and make the multi-select bar's Delete/Cancel buttons icon-only on mobile.

**Architecture:** `frontend/` is a static, no-framework, no-bundler vanilla-JS app — one `app.js` (DOM built imperatively), `index.html`, `style.css`. The swipe gesture reuses the app's existing raw-Pointer-Events approach (see `bindLongPress`, no new dependency), and a small refactor (`deleteTourById(id)`) gives both the swipe and the existing detail-panel delete button one shared delete-with-confirm-and-toast code path.

**Tech Stack:** Vanilla JS (Pointer Events), plain CSS media queries, Vitest (unit, `frontend/test/`), Playwright (fullstack e2e, `e2e/tests-fullstack/`, real touch dispatch via CDP).

## Global Constraints

- Swipe is touch-only (`e.pointerType === 'touch'`) — no mouse-drag support on desktop.
- Swipe is disabled while `state.selectMode` is true.
- Delete threshold is a fixed `SWIPE_DELETE_THRESHOLD_PX = 72` (pixels), independent of row width.
- Every delete goes through `confirm(t('confirm.deleteTour'))` — no swipe-to-delete-without-confirmation.
- No new backend/API changes — reuses `DELETE /api/tours/{tourId}` via the existing `apiFetch` call.
- No new i18n keys — the icon buttons reuse the existing `sidebar.deleteSelected` / `sidebar.cancelSelect` translation keys, now also as each button's `aria-label`.
- No optimistic removal — a tour stays in the list until its DELETE request resolves.
- Icon-only styling for `#btn-delete-selected` / `#btn-cancel-select` applies at the existing 768px breakpoint (`style.css:1068`).

---

### Task 1: Extract `deleteTourById(id)`

**Files:**

- Modify: `frontend/src/app.js:850-865` (`deleteSelectedTour`)
- Test: `e2e/tests-fullstack/tours.spec.ts` (existing test, run unmodified to verify no regression)

**Interfaces:**

- Produces: `async function deleteTourById(id)` — confirms, deletes via API, updates `state.tours`, closes the detail panel if the deleted tour was open, re-renders, refreshes the heatmap, toasts success/error. Later tasks (Task 2) call this directly with a tour id that is not necessarily `state.selectedTourId`.

This is a behavior-preserving refactor of already-covered code — `e2e/tests-fullstack/tours.spec.ts` already exercises `deleteSelectedTour()` end-to-end via the detail panel's delete button (`on(page).main.do.deleteTour()` at `tours.spec.ts:39`). Instead of writing a new failing test, this task runs that existing test before and after the change to confirm behavior is unchanged.

- [ ] **Step 1: Confirm the existing test currently passes**

Run: `cd e2e && npx playwright test --config playwright.fullstack.config.ts tests-fullstack/tours.spec.ts`
Expected: PASS (this establishes the pre-refactor baseline — the backend stack must already be running via `./buddy.sh development start-all`)

- [ ] **Step 2: Extract `deleteTourById(id)`**

In `frontend/src/app.js`, replace the current `deleteSelectedTour` function (lines 850-865):

```js
async function deleteSelectedTour() {
  const id = state.selectedTourId;
  if (!id) return;
  if (!confirm(t('confirm.deleteTour'))) return;
  try {
    const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    state.tours = state.tours.filter((t) => t.id !== id);
    deselectTour();
    renderSidebar();
    await renderAllHeatmap();
    toast(t('toast.tourDeleted'), 'success');
  } catch {
    toast(t('toast.tourDeleteError'), 'error');
  }
}
```

with:

```js
async function deleteTourById(id) {
  if (!confirm(t('confirm.deleteTour'))) return;
  try {
    const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    state.tours = state.tours.filter((t) => t.id !== id);
    if (id === state.selectedTourId) deselectTour();
    renderSidebar();
    await renderAllHeatmap();
    toast(t('toast.tourDeleted'), 'success');
  } catch {
    toast(t('toast.tourDeleteError'), 'error');
  }
}

async function deleteSelectedTour() {
  if (!state.selectedTourId) return;
  await deleteTourById(state.selectedTourId);
}
```

- [ ] **Step 3: Re-run the existing test to confirm behavior is unchanged**

Run: `cd e2e && npx playwright test --config playwright.fullstack.config.ts tests-fullstack/tours.spec.ts`
Expected: PASS (same as Step 1 — the refactor changed no observable behavior)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app.js
git commit -m "refactor: extract deleteTourById(id) from deleteSelectedTour (#289)"
```

---

### Task 2: Swipe-to-delete gesture (row restructuring + pointer handler)

**Files:**

- Modify: `frontend/src/app.js:536-572` (`createTourItem`), and add a new `bindSwipeToDelete` function near `bindLongPress` (`app.js:495-534`)
- Modify: `frontend/src/style.css:286-333` (`.tour-item` and its descendants)
- Test: `e2e/tests-fullstack/tours.spec.ts`, `e2e/tests-fullstack/long-press-select.spec.ts` (existing tests, run unmodified to verify the DOM restructuring didn't break click / long-press)

**Interfaces:**

- Consumes: `deleteTourById(id)` from Task 1; `state.selectMode` (existing); `bindLongPress(el, onLongPress)` (existing, unchanged signature).
- Produces: `bindSwipeToDelete(contentEl, tour)` — binds pointer handlers to a single row's content element. No return value; later tasks don't call this directly (only `createTourItem` does).

Each `.tour-item` becomes two layers: a `.tour-item-delete-bg` (the revealed delete icon, behind) and a `.tour-item-content` (the visible row — checkbox + details — that slides). All existing interactions (click-to-open, click-to-toggle-select, long-press) move from the `<li>` onto `.tour-item-content`, which is now the actual interactive surface.

- [ ] **Step 1: Restructure `.tour-item` CSS**

In `frontend/src/style.css`, replace the current block (lines 286-294):

```css
.tour-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.15s;
}
```

with:

```css
.tour-item {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--color-border);
}

/* Revealed as .tour-item-content slides away during a swipe (#289) — sits
   behind the row; overflow:hidden on .tour-item clips it to the row's own
   bounds so it never spills over neighboring rows. */
.tour-item-delete-bg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-danger);
  color: #fff;
  font-size: 20px;
}

/* The actual visible/interactive row. position:relative (stacked after
   .tour-item-delete-bg in the DOM) makes it paint above the absolutely
   positioned delete-bg layer at rest — an opaque background is required
   for that, not just paint order, since it's what visually hides the red
   layer until the user drags it aside. touch-action:pan-y leaves vertical
   scrolling to the browser but lets bindSwipeToDelete's pointer handlers
   own horizontal movement instead of the browser trying to pan there too. */
.tour-item-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--color-surface);
  cursor: pointer;
  transition: background 0.15s;
  touch-action: pan-y;
}
```

Then update the two rules further down that currently target `.tour-item:hover` and `.tour-item.active` (lines 312-320):

```css
.tour-item:hover {
  background: var(--color-surface-2);
}

.tour-item.active {
  background: var(--color-surface-2);
  border-left: 3px solid var(--color-primary);
  padding-left: 13px;
}
```

to:

```css
.tour-item-content:hover {
  background: var(--color-surface-2);
}

.tour-item.active .tour-item-content {
  background: var(--color-surface-2);
  border-left: 3px solid var(--color-primary);
  padding-left: 13px;
}
```

(`.tour-item-checkbox`, `.tour-item-details`, `.tour-item-name`, `.tour-item-meta` at `style.css:296-333` are unchanged — they're descendants of `.tour-item-content` either way.)

- [ ] **Step 2: Restructure `createTourItem` and add `bindSwipeToDelete`**

In `frontend/src/app.js`, add the threshold constant next to the existing long-press constants (line 448):

```js
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const SWIPE_DELETE_THRESHOLD_PX = 72;
```

Add `bindSwipeToDelete` directly after `bindLongPress` (after line 534):

```js
// Touch-only: mirrors bindLongPress's mobile-only role (#275). Live-
// translates contentEl during the drag so .tour-item-delete-bg (its
// sibling, behind it) is revealed proportionally to how far it's dragged.
// Crossing SWIPE_DELETE_THRESHOLD_PX on release deletes; anything short of
// that — including dragging back before releasing — just snaps back via
// reset(), no separate "cancelled" state needed since release only ever
// checks the final |dx| once.
function bindSwipeToDelete(contentEl, tour) {
  let start = null;
  let dragging = false;

  const reset = () => {
    contentEl.style.transition = 'transform 0.2s';
    contentEl.style.transform = 'translateX(0)';
    start = null;
    dragging = false;
  };

  contentEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || state.selectMode) return;
    start = { x: e.clientX, y: e.clientY };
    dragging = false;
  });

  contentEl.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging && Math.abs(dy) > Math.abs(dx)) {
      start = null; // vertical scroll intent — let the browser handle it
      return;
    }
    dragging = true;
    contentEl.style.transition = 'none';
    contentEl.style.transform = `translateX(${dx}px)`;
  });

  contentEl.addEventListener('pointerup', async (e) => {
    if (!dragging) {
      start = null;
      return;
    }
    const dx = e.clientX - start.x;
    reset();
    if (Math.abs(dx) >= SWIPE_DELETE_THRESHOLD_PX) {
      // Mirrors bindLongPress's own use of this: a drag this large risks a
      // trailing ghost click landing on whatever row now occupies this
      // screen position once the list re-renders without this tour.
      suppressNextTourClickOnce();
      await deleteTourById(tour.id);
    }
  });

  contentEl.addEventListener('pointercancel', reset);
  contentEl.addEventListener('pointerleave', () => {
    if (dragging) reset();
  });
}
```

Replace `createTourItem` (lines 536-572):

```js
function createTourItem(tour) {
  const li = document.createElement('li');
  li.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tour-item-checkbox';
  checkbox.checked = state.selectedIds.has(tour.id);
  checkbox.setAttribute('aria-hidden', 'true');
  show(checkbox, state.selectMode);

  const details = document.createElement('div');
  details.className = 'tour-item-details';
  details.append(
    textDiv('tour-item-name', tour.name),
    textDiv(
      'tour-item-meta',
      `${formatDate(tour.createdAt, i18n.dateLocale())} · ${formatDistance(tour.distance)}`,
    ),
  );

  li.append(checkbox, details);
  li.addEventListener('click', () => {
    if (state.selectMode) {
      toggleTourSelection(tour.id);
    } else {
      selectTour(tour.id);
    }
  });
  bindLongPress(li, () => {
    if (state.selectMode) return false;
    enterSelectMode();
    toggleTourSelection(tour.id);
    return true;
  });
  return li;
}
```

with:

```js
function createTourItem(tour) {
  const li = document.createElement('li');
  li.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');

  const deleteBg = document.createElement('div');
  deleteBg.className = 'tour-item-delete-bg';
  deleteBg.setAttribute('aria-hidden', 'true');
  deleteBg.textContent = '🗑';

  const content = document.createElement('div');
  content.className = 'tour-item-content';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tour-item-checkbox';
  checkbox.checked = state.selectedIds.has(tour.id);
  checkbox.setAttribute('aria-hidden', 'true');
  show(checkbox, state.selectMode);

  const details = document.createElement('div');
  details.className = 'tour-item-details';
  details.append(
    textDiv('tour-item-name', tour.name),
    textDiv(
      'tour-item-meta',
      `${formatDate(tour.createdAt, i18n.dateLocale())} · ${formatDistance(tour.distance)}`,
    ),
  );

  content.append(checkbox, details);
  content.addEventListener('click', () => {
    if (state.selectMode) {
      toggleTourSelection(tour.id);
    } else {
      selectTour(tour.id);
    }
  });
  bindLongPress(content, () => {
    if (state.selectMode) return false;
    enterSelectMode();
    toggleTourSelection(tour.id);
    return true;
  });
  bindSwipeToDelete(content, tour);

  li.append(deleteBg, content);
  return li;
}
```

- [ ] **Step 3: Confirm existing click / long-press tests still pass against the restructured DOM**

Run: `cd e2e && npx playwright test --config playwright.fullstack.config.ts tests-fullstack/tours.spec.ts tests-fullstack/long-press-select.spec.ts`
Expected: PASS — these tests click and long-press tour rows without knowing about `.tour-item-content` internals, so they only pass if the restructuring preserved the existing interactive behavior.

- [ ] **Step 4: Manual sanity check for the new gesture**

Run: `./buddy.sh development start-all` (if not already running), open the app on a touch device or Chrome DevTools device-toolbar touch emulation, swipe a tour row left and right — confirm the 🗑 layer is revealed behind the row as it's dragged, and that swiping past roughly a third of the row width and releasing triggers the delete confirmation.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app.js frontend/src/style.css
git commit -m "feat: swipe a tour row to delete it (touch-only) (#289)"
```

---

### Task 3: Icon-only Delete/Cancel in the selection bar (mobile)

**Files:**

- Modify: `frontend/src/index.html:159-168` (`#btn-delete-selected`, `#btn-cancel-select`)
- Modify: `frontend/src/style.css:1068-1152` (existing 768px media query block)
- Test: `e2e/tests-fullstack/multi-select-delete.spec.ts`, `e2e/tests-fullstack/long-press-select.spec.ts` (existing tests, run unmodified — both click these buttons by id, unaffected by the markup change)

**Interfaces:**

- No new functions — markup/CSS only. Button ids (`#btn-delete-selected`, `#btn-cancel-select`) are unchanged, so no page-object updates are needed in Task 4's e2e helpers.

- [ ] **Step 1: Wrap each button's label, add an icon and an aria-label**

In `frontend/src/index.html`, replace lines 159-168:

```html
<button id="btn-delete-selected" class="btn btn-danger" data-i18n="sidebar.deleteSelected">
  Delete
</button>
<button id="btn-cancel-select" class="btn btn-ghost" data-i18n="sidebar.cancelSelect">
  Cancel
</button>
```

with:

```html
<button
  id="btn-delete-selected"
  class="btn btn-danger"
  data-i18n-aria-label="sidebar.deleteSelected"
>
  <span class="btn-icon" aria-hidden="true">🗑</span>
  <span class="btn-label" data-i18n="sidebar.deleteSelected">Delete</span>
</button>
<button id="btn-cancel-select" class="btn btn-ghost" data-i18n-aria-label="sidebar.cancelSelect">
  <span class="btn-icon" aria-hidden="true">✕</span>
  <span class="btn-label" data-i18n="sidebar.cancelSelect">Cancel</span>
</button>
```

`data-i18n-aria-label` is required, not cosmetic: once `.btn-label` is hidden via `display: none` on mobile, the button's accessible name (computed from visible subtree text when there's no explicit `aria-label`) would otherwise be lost.

- [ ] **Step 2: Hide the label at the mobile breakpoint**

In `frontend/src/style.css`, inside the existing `@media (max-width: 768px)` block (`style.css:1068-1152`), add (e.g. right after the `.sort-menu-list { position: fixed; }` rule):

```css
/* Delete/Cancel become icon-only in the cramped mobile selection bar (#289) — data-i18n-aria-label on each button (index.html) keeps them
     accessible once .btn-label is hidden. */
.selection-bar-actions .btn-label {
  display: none;
}
```

- [ ] **Step 3: Confirm existing selection-bar tests still pass**

Run: `cd e2e && npx playwright test --config playwright.fullstack.config.ts tests-fullstack/multi-select-delete.spec.ts tests-fullstack/long-press-select.spec.ts`
Expected: PASS — both click `locators.buttons.deleteSelected` / `locators.buttons.cancelSelect` by id, unaffected by the added icon span.

- [ ] **Step 4: Manual layout check at both mobile breakpoints**

With the dev server running, use Chrome DevTools' device toolbar at 768px and at 480px width, enter select mode (long-press a row), and confirm the Delete/Cancel buttons show only their icons with no clipped/overlapping text, and that tapping each still works (delete asks for confirmation, cancel exits select mode).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.html frontend/src/style.css
git commit -m "feat: icon-only Delete/Cancel in the mobile selection bar (#289)"
```

---

### Task 4: E2E coverage for swipe-to-delete

**Files:**

- Modify: `e2e/pages/main-page.ts` (add `swipeTour` helper + locator/interface entries)
- Create: `e2e/tests-fullstack/swipe-delete.spec.ts`

**Interfaces:**

- Consumes: the swipe gesture from Task 2 (`bindSwipeToDelete`, `SWIPE_DELETE_THRESHOLD_PX = 72`), and the existing `on(page).main.do.longPressTour`/`enterSelectMode` helpers for the select-mode-disables-swipe case.
- Produces: `main-page.ts`'s `do.swipeTour(name: string, dx: number): Promise<void>` — a new page-object method other future specs can reuse.

- [ ] **Step 1: Add the `swipeTour` helper to `main-page.ts`**

In `e2e/pages/main-page.ts`, add to the `MainPage` interface's `do` block (after `longPressTour`, line 22):

```ts
    longPressTour(name: string): Promise<void>;
    swipeTour(name: string, dx: number): Promise<void>;
```

Add to the `interactions` object (after `longPressTour`, line 219, before `closeDetail`):

```ts
    // Genuine touch dispatch (CDP), matching longPressTour above — the
    // implementation (bindSwipeToDelete in app.js) reads real touch
    // pointerType, so a mouse-drag simulation would never exercise it.
    // Multiple intermediate touchMove events (not one big jump) mirror how
    // a real finger delivers a drag.
    swipeTour: async (name: string, dx: number) => {
      const row = locators.list.container.locator('.tour-item', { hasText: name });
      const box = await row.boundingBox();
      if (!box) throw new Error(`tour row "${name}" not found`);
      const startX = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y }],
      });
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: startX + (dx * i) / steps, y }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
    },
```

- [ ] **Step 2: Write the swipe-delete spec**

Create `e2e/tests-fullstack/swipe-delete.spec.ts`:

```ts
import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #289: swipe a tour row (touch only) to delete that single tour directly,
// with the same confirm() safety net as every other delete path.

buddyTest.describe('swipe to delete a tour', () => {
  buddyTest.use({ hasTouch: true });

  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    await toursContainer().items.create({
      id: '33333333-3333-4333-8333-333333333333',
      userId: 'local-dev-user',
      name: 'Swipe Tour A',
      distance: 5,
      createdAt: new Date(now).toISOString(),
    });
    await toursContainer().items.create({
      id: '44444444-4444-4444-8444-444444444444',
      userId: 'local-dev-user',
      name: 'Swipe Tour B',
      distance: 5,
      createdAt: new Date(now - 60_000).toISOString(),
    });
  });

  buddyTest(
    'swiping past the threshold and confirming deletes that tour only',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      await expect(on(page).main.locators.list.names).toHaveCount(2);

      page.once('dialog', (d) => d.accept());
      await on(page).main.do.swipeTour('Swipe Tour A', 120);

      await expect(on(page).main.locators.list.names).toHaveCount(1);
      await expect(on(page).main.locators.list.names.first()).toHaveText('Swipe Tour B');
    },
  );

  buddyTest('dismissing the confirm dialog keeps the tour', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    page.once('dialog', (d) => d.dismiss());
    await on(page).main.do.swipeTour('Swipe Tour A', 120);

    await expect(on(page).main.locators.list.names).toHaveCount(2);
  });

  buddyTest('a swipe short of the threshold snaps back with no action', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    // 30px is well under bindSwipeToDelete's 72px threshold — no dialog
    // should even appear, so nothing to accept/dismiss here.
    await on(page).main.do.swipeTour('Swipe Tour A', 30);

    await expect(on(page).main.locators.list.names).toHaveCount(2);
    // The row must still open normally afterwards — snapping back shouldn't
    // leave it in a stuck or half-transformed state.
    await on(page).main.do.selectTour('Swipe Tour A');
    await expect(on(page).main.locators.detail.name).toHaveText('Swipe Tour A');
  });

  buddyTest('swiping while in select mode is a no-op', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.longPressTour('Swipe Tour A');
    await expect(on(page).main.locators.selection.bar).toBeVisible();

    await on(page).main.do.swipeTour('Swipe Tour A', 120);

    await expect(on(page).main.locators.list.names).toHaveCount(2);
    await expect(on(page).main.locators.selection.bar).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the new spec**

Run: `cd e2e && npx playwright test --config playwright.fullstack.config.ts tests-fullstack/swipe-delete.spec.ts`
Expected: PASS, all 4 tests

- [ ] **Step 4: Run the full fullstack e2e suite to confirm no cross-test regression**

Run: `cd e2e && npm run test:fullstack`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/pages/main-page.ts e2e/tests-fullstack/swipe-delete.spec.ts
git commit -m "test: e2e coverage for swipe-to-delete (#289)"
```
