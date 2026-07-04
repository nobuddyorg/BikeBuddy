# Tour List Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sidebar tour list shows at most 20 tours per page, with Prev/Next controls, while search and sort keep working exactly as today.

**Architecture:** A pure `paginate(items, page, pageSize)` helper added to `frontend/src/lib/tours.js` slices the already-filtered/sorted array `visibleTours()` produces. `renderSidebar()` in `frontend/src/app.js` calls it and renders a small Prev/Next pager below the list. No backend changes — `GET /api/tours` keeps returning the full (small) list as today.

**Tech Stack:** Same as the rest of the repo — plain ES modules, Vitest for unit tests, Playwright for e2e (full-stack suite, since static UI tests have no real tour data to paginate).

## Global Constraints

- No backend/API pagination — `GetTours` is unchanged.
- Page size: 20 tours per page.
- Pager UI: Prev button, `Page X of Y` label, Next button — no numbered page buttons.
- Pager is hidden entirely when `totalPages <= 1`.
- Search text change or sort change resets to page 1. Tour add/delete do not need an explicit reset — clamping handles it.
- `paginate()` clamps an out-of-range page into `[1, totalPages]`.

---

## File Structure

- Modify `frontend/src/lib/tours.js` — add `PAGE_SIZE` and `paginate()`.
- Modify `frontend/test/tours.test.js` — unit tests for `paginate()`.
- Modify `frontend/src/app.js` — `state.page`, wire `paginate()` into `renderSidebar()`, pager element refs + click handlers, reset `state.page` on search/sort change.
- Modify `frontend/src/index.html` — add `#tour-pager` markup after `#tour-list`.
- Modify `frontend/src/style.css` — `.tour-pager` / `.tour-pager-label` rules.
- Modify `frontend/src/locales/{en,de,es}.json` — `sidebar.pagerPrevAria`, `sidebar.pagerNextAria`, `sidebar.pagerLabel`.
- Modify `e2e/pages/main-page.ts` — add pager locators/actions.
- Create `e2e/tests-fullstack/pagination.spec.ts` — seeds 25 tours directly into Cosmos and exercises paging + search-reset.

---

### Task 1: `paginate()` helper

**Files:**

- Modify: `frontend/src/lib/tours.js`
- Test: `frontend/test/tours.test.js`

**Interfaces:**

- Produces: `export const PAGE_SIZE = 20;` and `export function paginate(items, page, pageSize)` — returns `{ items: Array, page: number, totalPages: number }`. `totalPages` is `Math.max(1, Math.ceil(items.length / pageSize))`. `page` in the input can be any integer; the returned `page` is clamped into `[1, totalPages]`, and `items` is the slice for that clamped page.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/test/tours.test.js` (after the existing `visibleTours` describe block, keeping the existing `import` line but adding `paginate`):

```js
import { describe, it, expect } from 'vitest';
import { fuzzyMatch, visibleTours, paginate } from '../src/lib/tours.js';
```

```js
describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: `t${i + 1}` }));

  it('returns the first page by default page size', () => {
    const result = paginate(items, 1, 20);
    expect(result.items).toHaveLength(20);
    expect(result.items[0].id).toBe('t1');
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it('returns the remainder on the last page', () => {
    const result = paginate(items, 2, 20);
    expect(result.items).toHaveLength(5);
    expect(result.items[0].id).toBe('t21');
    expect(result.page).toBe(2);
  });

  it('clamps a page beyond totalPages to the last page', () => {
    const result = paginate(items, 99, 20);
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(5);
  });

  it('clamps a page below 1 to page 1', () => {
    const result = paginate(items, 0, 20);
    expect(result.page).toBe(1);
    expect(result.items[0].id).toBe('t1');
  });

  it('reports a single page for an empty list', () => {
    const result = paginate([], 1, 20);
    expect(result.items).toEqual([]);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
  });

  it('reports a single page when everything fits on one page', () => {
    const result = paginate(items.slice(0, 10), 1, 20);
    expect(result.totalPages).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run test/tours.test.js`
Expected: FAIL — `paginate` is not exported from `../src/lib/tours.js`.

- [ ] **Step 3: Implement `paginate()`**

In `frontend/src/lib/tours.js`, add at the end of the file:

```js
export const PAGE_SIZE = 20;

// Slices `items` to one page, clamping `page` into [1, totalPages] so a stale
// page number (after a search/sort change shrinks the result set) never
// produces an out-of-range slice.
export function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: clamped,
    totalPages,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run test/tours.test.js`
Expected: PASS, all tests green (existing `fuzzyMatch`/`visibleTours` tests plus the new 6 `paginate` tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tours.js frontend/test/tours.test.js
git commit -m "feat: add paginate() helper for the tour list (#230)"
```

---

### Task 2: Wire pagination into the sidebar

**Files:**

- Modify: `frontend/src/app.js`
- Modify: `frontend/src/index.html`
- Modify: `frontend/src/style.css`
- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/locales/de.json`
- Modify: `frontend/src/locales/es.json`

**Interfaces:**

- Consumes: `paginate`, `PAGE_SIZE` from Task 1 (`frontend/src/lib/tours.js`).
- Produces: no new exports — `renderSidebar()` keeps its existing no-argument signature; all existing callers (`loadTours`, tour delete, tour upload success, etc.) are unaffected.

DOM/wiring-only, no Vitest coverage for this task itself — verified by the e2e test in Task 3 and a manual check.

- [ ] **Step 1: Update the import and add `page` to state**

In `frontend/src/app.js`, replace:

```js
import { visibleTours } from './lib/tours.js';
```

with:

```js
import { visibleTours, paginate, PAGE_SIZE } from './lib/tours.js';
```

Replace the `state` object:

```js
const state = {
  user: null,
  tours: [],
  selectedTourId: null,
  heatLayer: null,
  pinLayer: null,
  showPins: false,
  loadingTours: false,
  sort: 'date-desc',
  search: '',
};
```

with:

```js
const state = {
  user: null,
  tours: [],
  selectedTourId: null,
  heatLayer: null,
  pinLayer: null,
  showPins: false,
  loadingTours: false,
  sort: 'date-desc',
  search: '',
  page: 1,
};
```

- [ ] **Step 2: Add element refs**

In `frontend/src/app.js`, after the line `const elTourSort = $('tour-sort');`, add:

```js
const elTourPager = $('tour-pager');
const elTourPagerPrev = $('tour-pager-prev');
const elTourPagerLabel = $('tour-pager-label');
const elTourPagerNext = $('tour-pager-next');
```

- [ ] **Step 3: Update `renderSidebar()`**

Replace the whole function:

```js
function renderSidebar() {
  const signedIn = !!state.user;
  const loading = signedIn && state.loadingTours;
  const hasTours = signedIn && !loading && state.tours.length > 0;

  show(elTourLoading, loading);
  show(elAuthPrompt, !signedIn);
  show(elNoTours, signedIn && !loading && state.tours.length === 0);
  show(elTourControls, hasTours);
  show(elTourList, hasTours);
  elTourCount.textContent = signedIn && !loading ? state.tours.length : '0';

  elTourList.innerHTML = '';
  if (!hasTours) return;

  const visible = visibleTours(state.tours, state.sort, state.search);
  if (visible.length === 0) {
    elTourList.appendChild(textDiv('tour-empty', t('tours.noMatch')));
    return;
  }
  visible.forEach((tour) => elTourList.appendChild(createTourItem(tour)));
  elTourList.appendChild(createShowAllButton());
}
```

with:

```js
function renderSidebar() {
  const signedIn = !!state.user;
  const loading = signedIn && state.loadingTours;
  const hasTours = signedIn && !loading && state.tours.length > 0;

  show(elTourLoading, loading);
  show(elAuthPrompt, !signedIn);
  show(elNoTours, signedIn && !loading && state.tours.length === 0);
  show(elTourControls, hasTours);
  show(elTourList, hasTours);
  elTourCount.textContent = signedIn && !loading ? state.tours.length : '0';

  elTourList.innerHTML = '';
  if (!hasTours) {
    show(elTourPager, false);
    return;
  }

  const visible = visibleTours(state.tours, state.sort, state.search);
  if (visible.length === 0) {
    elTourList.appendChild(textDiv('tour-empty', t('tours.noMatch')));
    show(elTourPager, false);
    return;
  }

  const { items, page, totalPages } = paginate(visible, state.page, PAGE_SIZE);
  state.page = page;
  items.forEach((tour) => elTourList.appendChild(createTourItem(tour)));
  elTourList.appendChild(createShowAllButton());

  show(elTourPager, totalPages > 1);
  elTourPagerLabel.textContent = t('sidebar.pagerLabel', { page, totalPages });
  elTourPagerPrev.disabled = page <= 1;
  elTourPagerNext.disabled = page >= totalPages;
}
```

- [ ] **Step 4: Reset to page 1 on search/sort change, add pager click handlers**

In `frontend/src/app.js`, replace:

```js
elTourSearch.addEventListener('input', () => {
  state.search = elTourSearch.value;
  renderSidebar();
});
elTourSort.addEventListener('change', () => {
  state.sort = elTourSort.value;
  renderSidebar();
});
```

with:

```js
elTourSearch.addEventListener('input', () => {
  state.search = elTourSearch.value;
  state.page = 1;
  renderSidebar();
});
elTourSort.addEventListener('change', () => {
  state.sort = elTourSort.value;
  state.page = 1;
  renderSidebar();
});
elTourPagerPrev.addEventListener('click', () => {
  state.page -= 1;
  renderSidebar();
});
elTourPagerNext.addEventListener('click', () => {
  state.page += 1;
  renderSidebar();
});
```

- [ ] **Step 5: Add the pager markup**

In `frontend/src/index.html`, after the line `<ul id="tour-list" class="tour-list hidden"></ul>` and before the `<div id="no-tours" class="empty-state hidden">` block, add:

```html
<div id="tour-pager" class="tour-pager hidden">
  <button id="tour-pager-prev" class="btn btn-ghost" data-i18n-aria-label="sidebar.pagerPrevAria">
    ‹
  </button>
  <span id="tour-pager-label" class="tour-pager-label"></span>
  <button id="tour-pager-next" class="btn btn-ghost" data-i18n-aria-label="sidebar.pagerNextAria">
    ›
  </button>
</div>
```

- [ ] **Step 6: Add pager styles**

In `frontend/src/style.css`, after the `.tour-list { ... }` rule block (the one with `list-style: none; overflow-y: auto; flex: 1;`), add:

```css
.tour-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border);
}

.tour-pager-label {
  color: var(--color-text-muted);
  font-size: 13px;
}
```

- [ ] **Step 7: Add locale keys**

In `frontend/src/locales/en.json`, after the line `"sidebar.uploadFirst": "Upload your first GPX",`, add:

```json
  "sidebar.pagerPrevAria": "Previous page",
  "sidebar.pagerNextAria": "Next page",
  "sidebar.pagerLabel": "Page {page} of {totalPages}",
```

In `frontend/src/locales/de.json`, after the equivalent `"sidebar.uploadFirst"` line, add:

```json
  "sidebar.pagerPrevAria": "Vorherige Seite",
  "sidebar.pagerNextAria": "Nächste Seite",
  "sidebar.pagerLabel": "Seite {page} von {totalPages}",
```

In `frontend/src/locales/es.json`, after the equivalent `"sidebar.uploadFirst"` line, add:

```json
  "sidebar.pagerPrevAria": "Página anterior",
  "sidebar.pagerNextAria": "Página siguiente",
  "sidebar.pagerLabel": "Página {page} de {totalPages}",
```

- [ ] **Step 8: Run the i18n key-parity test and lint/format**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy/frontend
npx vitest run test/i18n.test.js
cd /Users/nicolemundhenke/Repos/BikeBuddy
functions/node_modules/.bin/eslint --config functions/eslint.frontend.config.js frontend/src frontend/test
cd functions && npx prettier --check --config .prettierrc.json '../frontend/*.js' '../frontend/src/*.{js,css,html}' '../frontend/src/lib/**/*.js' '../frontend/test/**/*.js' '../frontend/src/locales/*.json'
```

Expected: all pass. If Prettier reports formatting issues, run the equivalent `--write` command (same file globs) and re-check.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app.js frontend/src/index.html frontend/src/style.css frontend/src/locales/en.json frontend/src/locales/de.json frontend/src/locales/es.json
git commit -m "feat: paginate the tour sidebar list, 20 per page (#230)"
```

---

### Task 3: E2E coverage

**Files:**

- Modify: `e2e/pages/main-page.ts`
- Create: `e2e/tests-fullstack/pagination.spec.ts`

**Interfaces:**

- Consumes: the real running app from Task 2. Also consumes `toursContainer()` and `clearTours()`/`clearUsers()` from `e2e/tests-fullstack/usersDb.ts` (existing helpers, same ones `photo-pins.spec.ts` uses to seed Cosmos directly).
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Add pager locators and actions to the page object**

In `e2e/pages/main-page.ts`, add to the `MainPage` interface's `do` block (after `showPins`):

```ts
    pagerPrev(): Promise<void>;
    pagerNext(): Promise<void>;
```

Add to the `locators` interface (as a new top-level entry, after `pins`):

```ts
pager: {
  container: Locator;
  label: Locator;
  prev: Locator;
  next: Locator;
}
```

In the `locators` object literal, add after the `pins` entry:

```ts
    pager: {
      container: page.locator('#tour-pager'),
      label: page.locator('#tour-pager-label'),
      prev: page.locator('#tour-pager-prev'),
      next: page.locator('#tour-pager-next'),
    },
```

In the `interactions` object, add after `showPins`:

```ts
    pagerPrev: async () => locators.pager.prev.click(),
    pagerNext: async () => locators.pager.next.click(),
```

- [ ] **Step 2: Write the test**

Create `e2e/tests-fullstack/pagination.spec.ts`:

```ts
import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #230: the sidebar list paginates at 20 tours/page. Seeds 25 tours directly
// into Cosmos (like photo-pins.spec.ts) since no real upload is needed to
// exercise list/search/pagination behavior.

buddyTest.describe('tour list pagination', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    const docs = Array.from({ length: 24 }, (_, i) => ({
      id: `pagination-tour-${i + 1}`,
      userId: 'local-dev-user',
      name: `Pagination Tour ${i + 1}`,
      distance: 10,
      createdAt: new Date(now - i * 60_000).toISOString(),
    }));
    docs.push({
      id: 'pagination-tour-unique',
      userId: 'local-dev-user',
      name: 'Zzyzx Unique Tour',
      distance: 10,
      createdAt: new Date(now - 25 * 60_000).toISOString(),
    });
    await Promise.all(docs.map((doc) => toursContainer().items.create(doc)));
  });

  buddyTest('pages through 25 tours, 20 per page', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.count).toHaveText('25');

    await expect(on(page).main.locators.list.names).toHaveCount(20);
    await expect(on(page).main.locators.pager.label).toHaveText('Page 1 of 2');
    await expect(on(page).main.locators.pager.prev).toBeDisabled();
    await expect(on(page).main.locators.pager.next).toBeEnabled();

    await on(page).main.do.pagerNext();
    await expect(on(page).main.locators.list.names).toHaveCount(5);
    await expect(on(page).main.locators.pager.label).toHaveText('Page 2 of 2');
    await expect(on(page).main.locators.pager.next).toBeDisabled();
    await expect(on(page).main.locators.pager.prev).toBeEnabled();

    await on(page).main.do.pagerPrev();
    await expect(on(page).main.locators.list.names).toHaveCount(20);
    await expect(on(page).main.locators.pager.label).toHaveText('Page 1 of 2');
  });

  buddyTest(
    'searching resets to page 1 even when results still span pages',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.pagerNext();
      await expect(on(page).main.locators.pager.label).toHaveText('Page 2 of 2');

      // Matches all 24 "Pagination Tour N" docs (excludes the "Zzyzx" one) — still
      // 2 pages, so this proves the explicit reset-on-search, not just clamping
      // (clamping alone wouldn't correct an in-range stale page number).
      await on(page).main.do.search('pagination tour');
      await expect(on(page).main.locators.list.names).toHaveCount(20);
      await expect(on(page).main.locators.pager.label).toHaveText('Page 1 of 2');
    },
  );

  buddyTest('the pager hides once search results fit on one page', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.pagerNext();
    await on(page).main.do.search('zzyzx');
    await expect(on(page).main.locators.list.names).toHaveText(['Zzyzx Unique Tour']);
    await expect(on(page).main.locators.pager.container).toBeHidden();
  });
});
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd e2e && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the test**

Run: `cd e2e && npm run test:fullstack -- pagination.spec.ts` (requires the local stack: Cosmos emulator + Azurite + a running Functions host — start with `./buddy.sh development start-cosmos` and `./buddy.sh development start-azurite` first if not already running).
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Format check**

Run: `cd e2e && ./node_modules/.bin/prettier --check 'pages/main-page.ts' 'tests-fullstack/pagination.spec.ts'`
Expected: no issues. If it reports formatting problems, run the equivalent with `--write` and re-check.

- [ ] **Step 6: Commit**

```bash
git add e2e/pages/main-page.ts e2e/tests-fullstack/pagination.spec.ts
git commit -m "test(e2e): cover tour list pagination and search-reset (#230)"
```

---

## Final verification

- [ ] `cd frontend && npm test` — all unit tests pass, including the new `paginate()` tests.
- [ ] `cd e2e && npm run test:fullstack` — full fullstack suite passes, including the new pagination tests.
- [ ] `prek run --all-files` (or on the changed files) — all hooks pass.
- [ ] Manual check in a real browser with the local stack running: upload (or seed) more than 20 tours, confirm the pager appears, Prev/Next work and disable at the ends, and typing in the search box jumps back to page 1.
- [ ] Open a PR with `Fixes #230` in the body so it auto-closes on merge.
