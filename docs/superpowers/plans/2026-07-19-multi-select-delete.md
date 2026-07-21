# Multi-Select Bulk Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user select multiple tours in the sidebar list and delete them all in one confirmation, from any page/search/sort state.

**Architecture:** A `state.selectMode` flag + `state.selectedIds` Set drive the sidebar UI (`frontend/src/app.js`). Entering select mode shows a checkbox per `.tour-item` and a selection action bar; the existing `DELETE /api/tours/{tourId}` endpoint is called once per selected ID with bounded concurrency via the existing `runWithConcurrency` helper (already used for photo uploads) — no backend or new-endpoint work.

**Tech Stack:** Same as the rest of the repo — plain ES modules, Vitest for unit tests, Playwright for e2e (full-stack suite, since the static UI test config has no real tour data).

## Global Constraints

- No new batch API endpoint — reuse `DELETE /api/tours/{tourId}` (`functions/src/DeleteTour/index.js`) with concurrency 3 via `runWithConcurrency` (`frontend/src/lib/concurrency.js`).
- No change to the existing single-tour delete button/flow in the detail panel (`deleteSelectedTour`, `#btn-delete-tour`).
- No always-visible per-row checkboxes — selection is an explicit toggle mode entered via a "Select" button.
- Selection (`state.selectedIds`) is independent of what's currently visible — it survives search/sort/page changes.
- The bulk-delete confirm message has no count in it (the selection bar already shows the count) — sidesteps needing plural i18n forms the engine doesn't support.
- Toast rules: all succeeded + count === 1 → reuse `toast.tourDeleted`; all succeeded + count > 1 → `toast.toursDeleted`; partial success → `toast.toursDeletedPartial`; all failed → reuse `toast.tourDeleteError`.
- Every new i18n key must be added to **all 7** locale files (`en`, `de`, `es`, `fr`, `it`, `nl`, `pt`) — `frontend/test/i18n.test.js` enforces exact key parity across locales and will fail the build otherwise.

---

## File Structure

- Modify `frontend/src/app.js` — `state` fields, element refs, `createTourItem`/`renderSidebar` updates, `toggleTourSelection`/`enterSelectMode`/`exitSelectMode`, `deleteSelectedTours`, event listener wiring.
- Modify `frontend/src/index.html` — "Select" button in the sidebar header, the `#selection-bar` markup.
- Modify `frontend/src/style.css` — `.sidebar-header-title`, `.tour-item` flex layout + `.tour-item-checkbox`/`.tour-item-details`, `.selection-bar`/`.selection-count`/`.selection-bar-actions`.
- Modify `frontend/src/locales/{en,de,es,fr,it,nl,pt}.json` — 7 new keys total, split across Task 1 (UI labels) and Task 2 (confirm/toast copy).
- Modify `e2e/pages/main-page.ts` — locators/actions for select mode.
- Create `e2e/tests-fullstack/multi-select-delete.spec.ts` — seeds tours directly into Cosmos, selects across a page boundary, deletes, asserts the remaining set.

---

### Task 1: Select mode UI (enter/exit, checkboxes, selection bar)

**Files:**

- Modify: `frontend/src/app.js`
- Modify: `frontend/src/index.html`
- Modify: `frontend/src/style.css`
- Modify: `frontend/src/locales/en.json`, `de.json`, `es.json`, `fr.json`, `it.json`, `nl.json`, `pt.json`

**Interfaces:**

- Consumes: existing `state`, `show()`, `t()`, `textDiv()`, `formatDate`, `formatDistance`, `i18n.dateLocale()`, `visibleTours`, `paginate`, `PAGE_SIZE` — all already imported/defined in `frontend/src/app.js`.
- Produces: `state.selectMode: boolean`, `state.selectedIds: Set<string>`, `toggleTourSelection(tourId: string): void`, `enterSelectMode(): void`, `exitSelectMode(): void` — Task 2's `deleteSelectedTours()` reads `state.selectedIds` and calls `exitSelectMode`-equivalent logic inline (see Task 2).

No new pure logic worth a Vitest unit test — this is state + DOM wiring, verified manually below (matches this repo's existing convention: `frontend/test/*.test.js` only covers `frontend/src/lib/*.js` pure functions, and there's no DOM-level test harness for `app.js`).

- [ ] **Step 1: Add `selectMode`/`selectedIds` to `state`**

In `frontend/src/app.js`, replace:

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
  selectMode: false,
  selectedIds: new Set(),
};
```

- [ ] **Step 2: Add element refs**

In `frontend/src/app.js`, after the line `const elBtnShowAll = $('btn-show-all');`, add:

```js
const elBtnSelectMode = $('btn-select-mode');
const elSelectionBar = $('selection-bar');
const elSelectionCount = $('selection-count');
const elBtnDeleteSelected = $('btn-delete-selected');
const elBtnCancelSelect = $('btn-cancel-select');
```

- [ ] **Step 3: Rewrite `createTourItem()` to render a checkbox in select mode**

In `frontend/src/app.js`, replace:

```js
function createTourItem(tour) {
  const li = document.createElement('li');
  li.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');
  li.append(
    textDiv('tour-item-name', tour.name),
    textDiv(
      'tour-item-meta',
      `${formatDate(tour.createdAt, i18n.dateLocale())} · ${formatDistance(tour.distance)}`,
    ),
  );
  li.addEventListener('click', () => selectTour(tour.id));
  return li;
}
```

with:

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
  return li;
}
```

- [ ] **Step 4: Add selection-mode functions**

In `frontend/src/app.js`, directly after the `renderSidebar()` function (before the `// ── Heatmap rendering ─` comment), add:

```js
function toggleTourSelection(tourId) {
  if (state.selectedIds.has(tourId)) {
    state.selectedIds.delete(tourId);
  } else {
    state.selectedIds.add(tourId);
  }
  renderSidebar();
}

function enterSelectMode() {
  state.selectMode = true;
  renderSidebar();
}

function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  renderSidebar();
}
```

- [ ] **Step 5: Update `renderSidebar()` to show/hide the select button, bar, and count**

In `frontend/src/app.js`, replace:

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
  show(elBtnShowAll, hasTours);
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

  show(elTourPager, totalPages > 1);
  elTourPagerLabel.textContent = t('sidebar.pagerLabel', { page, totalPages });
  elTourPagerPrev.disabled = page <= 1;
  elTourPagerNext.disabled = page >= totalPages;
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
  show(elBtnShowAll, hasTours);
  show(elBtnSelectMode, hasTours);
  show(elSelectionBar, hasTours && state.selectMode);
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

  show(elTourPager, totalPages > 1);
  elTourPagerLabel.textContent = t('sidebar.pagerLabel', { page, totalPages });
  elTourPagerPrev.disabled = page <= 1;
  elTourPagerNext.disabled = page >= totalPages;

  elSelectionCount.textContent = t('sidebar.selectedCount', {
    count: state.selectedIds.size,
  });
  elBtnDeleteSelected.disabled = state.selectedIds.size === 0;
}
```

- [ ] **Step 6: Add the "Select" button and selection bar markup**

In `frontend/src/index.html`, replace:

```html
<div class="sidebar-header">
  <h2 data-i18n="sidebar.myTours">My Tours</h2>
  <span id="tour-count" class="badge">0</span>
</div>
```

with:

```html
<div class="sidebar-header">
  <div class="sidebar-header-title">
    <h2 data-i18n="sidebar.myTours">My Tours</h2>
    <span id="tour-count" class="badge">0</span>
  </div>
  <button id="btn-select-mode" class="btn btn-ghost hidden" data-i18n="sidebar.select">
    Select
  </button>
</div>
```

In `frontend/src/index.html`, replace:

```html
<ul id="tour-list" class="tour-list hidden"></ul>
```

with:

```html
<div id="selection-bar" class="selection-bar hidden">
  <span id="selection-count" class="selection-count"></span>
  <div class="selection-bar-actions">
    <button id="btn-delete-selected" class="btn btn-danger" data-i18n="sidebar.deleteSelected">
      Delete
    </button>
    <button id="btn-cancel-select" class="btn btn-ghost" data-i18n="sidebar.cancelSelect">
      Cancel
    </button>
  </div>
</div>

<ul id="tour-list" class="tour-list hidden"></ul>
```

- [ ] **Step 7: Add styles**

In `frontend/src/style.css`, replace:

```css
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-header h2 {
  font-size: 15px;
  font-weight: 600;
}
```

with:

```css
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-header h2 {
  font-size: 15px;
  font-weight: 600;
}
```

In `frontend/src/style.css`, replace:

```css
.tour-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.15s;
}
```

with:

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

.tour-item-checkbox {
  flex-shrink: 0;
  /* Purely visual — the li's own click handler is the single source of
     interaction (see createTourItem), avoiding a double-toggle between the
     checkbox's native click and the row's click listener. */
  pointer-events: none;
  accent-color: var(--color-primary);
}

.tour-item-details {
  /* min-width: 0 lets tour-item-name's text-overflow: ellipsis work inside
     a flex item — without it, flex items refuse to shrink below content size. */
  min-width: 0;
  flex: 1;
}
```

In `frontend/src/style.css`, after the `.show-all-btn:hover { ... }` rule block, add:

```css
.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-2);
}

.selection-count {
  font-size: 13px;
  color: var(--color-text-muted);
  font-weight: 500;
}

.selection-bar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
```

- [ ] **Step 8: Wire the enter/cancel listeners**

In `frontend/src/app.js`, replace:

```js
elBtnShowAll.addEventListener('click', () => {
  deselectTour();
  renderAllHeatmap();
});
```

with:

```js
elBtnShowAll.addEventListener('click', () => {
  deselectTour();
  renderAllHeatmap();
});
elBtnSelectMode.addEventListener('click', enterSelectMode);
elBtnCancelSelect.addEventListener('click', exitSelectMode);
```

(`elBtnDeleteSelected`'s listener is added in Task 2, once `deleteSelectedTours()` exists — the button renders and is visible in select mode but has no handler until then.)

- [ ] **Step 9: Add i18n keys to all 7 locale files**

In `frontend/src/locales/en.json`, replace:

```json
  "sidebar.pagerLabel": "Page {page} of {totalPages}",
```

with:

```json
  "sidebar.pagerLabel": "Page {page} of {totalPages}",
  "sidebar.select": "Select",
  "sidebar.selectedCount": "{count} selected",
  "sidebar.deleteSelected": "Delete",
  "sidebar.cancelSelect": "Cancel",
```

In `frontend/src/locales/de.json`, replace:

```json
  "sidebar.pagerLabel": "Seite {page} von {totalPages}",
```

with:

```json
  "sidebar.pagerLabel": "Seite {page} von {totalPages}",
  "sidebar.select": "Auswählen",
  "sidebar.selectedCount": "{count} ausgewählt",
  "sidebar.deleteSelected": "Löschen",
  "sidebar.cancelSelect": "Abbrechen",
```

In `frontend/src/locales/es.json`, replace:

```json
  "sidebar.pagerLabel": "Página {page} de {totalPages}",
```

with:

```json
  "sidebar.pagerLabel": "Página {page} de {totalPages}",
  "sidebar.select": "Seleccionar",
  "sidebar.selectedCount": "{count} seleccionadas",
  "sidebar.deleteSelected": "Eliminar",
  "sidebar.cancelSelect": "Cancelar",
```

In `frontend/src/locales/fr.json`, replace:

```json
  "sidebar.pagerLabel": "Page {page} sur {totalPages}",
```

with:

```json
  "sidebar.pagerLabel": "Page {page} sur {totalPages}",
  "sidebar.select": "Sélectionner",
  "sidebar.selectedCount": "{count} sélectionnées",
  "sidebar.deleteSelected": "Supprimer",
  "sidebar.cancelSelect": "Annuler",
```

In `frontend/src/locales/it.json`, replace:

```json
  "sidebar.pagerLabel": "Pagina {page} di {totalPages}",
```

with:

```json
  "sidebar.pagerLabel": "Pagina {page} di {totalPages}",
  "sidebar.select": "Seleziona",
  "sidebar.selectedCount": "{count} selezionati",
  "sidebar.deleteSelected": "Elimina",
  "sidebar.cancelSelect": "Annulla",
```

In `frontend/src/locales/nl.json`, replace:

```json
  "sidebar.pagerLabel": "Pagina {page} van {totalPages}",
```

with:

```json
  "sidebar.pagerLabel": "Pagina {page} van {totalPages}",
  "sidebar.select": "Selecteren",
  "sidebar.selectedCount": "{count} geselecteerd",
  "sidebar.deleteSelected": "Verwijderen",
  "sidebar.cancelSelect": "Annuleren",
```

In `frontend/src/locales/pt.json`, replace:

```json
  "sidebar.pagerLabel": "Página {page} de {totalPages}",
```

with:

```json
  "sidebar.pagerLabel": "Página {page} de {totalPages}",
  "sidebar.select": "Selecionar",
  "sidebar.selectedCount": "{count} selecionados",
  "sidebar.deleteSelected": "Eliminar",
  "sidebar.cancelSelect": "Cancelar",
```

- [ ] **Step 10: Run the i18n key-parity test, lint, and format checks**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy/frontend
npx vitest run test/i18n.test.js
cd /Users/nicolemundhenke/Repos/BikeBuddy
functions/node_modules/.bin/eslint --config functions/eslint.frontend.config.js frontend/src frontend/test
cd functions && npx prettier --check --config .prettierrc.json '../frontend/*.js' '../frontend/src/*.{js,css,html}' '../frontend/src/lib/**/*.js' '../frontend/test/**/*.js' '../frontend/src/locales/*.json'
```

Expected: all pass. If Prettier reports formatting issues, run the equivalent `--write` command (same file globs) and re-check.

- [ ] **Step 11: Manual smoke check**

Run: `cd /Users/nicolemundhenke/Repos/BikeBuddy && ./buddy.sh development start-all` (requires Docker running; first run also needs `./buddy.sh development setup`). Wait for it to open `http://localhost:4280`.

With at least 2 tours already uploaded (or upload 2 via the "Upload GPX" button):

1. Click "Select" in the sidebar header → a checkbox appears on each tour item, and a bar reading "0 selected" with disabled "Delete" + enabled "Cancel" appears above the list.
2. Click a tour row → its checkbox becomes checked, the bar updates to "1 selected", "Delete" becomes enabled. Clicking the row does **not** open the detail panel while in select mode.
3. Click a second row → "2 selected".
4. Click "Cancel" → the bar and checkboxes disappear, selection is cleared.
5. Click "Select" again, select one tour, click it again to uncheck → back to "0 selected", "Delete" disabled again.

Stop the stack after: `./buddy.sh development stop`.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/app.js frontend/src/index.html frontend/src/style.css frontend/src/locales/en.json frontend/src/locales/de.json frontend/src/locales/es.json frontend/src/locales/fr.json frontend/src/locales/it.json frontend/src/locales/nl.json frontend/src/locales/pt.json
git commit -m "feat: add multi-select mode to the tour sidebar (#272)"
```

---

### Task 2: Bulk delete action

**Files:**

- Modify: `frontend/src/app.js`
- Modify: `frontend/src/locales/en.json`, `de.json`, `es.json`, `fr.json`, `it.json`, `nl.json`, `pt.json`

**Interfaces:**

- Consumes: `state.selectedIds`, `state.selectMode`, `state.tours`, `state.selectedTourId`, `deselectTour()`, `renderSidebar()`, `renderAllHeatmap()`, `apiFetch()`, `toast()`, `t()`, `runWithConcurrency` (from Task 1 and pre-existing code).
- Produces: `deleteSelectedTours(): Promise<void>` — not consumed elsewhere; it's the click handler for `#btn-delete-selected`.

- [ ] **Step 1: Add `deleteSelectedTours()`**

In `frontend/src/app.js`, replace:

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

async function deleteSelectedTours() {
  if (state.selectedIds.size === 0) return;
  if (!confirm(t('confirm.deleteTours'))) return;

  const ids = [...state.selectedIds];
  const succeeded = [];
  const failed = [];

  await runWithConcurrency(ids, 3, async (id) => {
    try {
      const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      succeeded.push(id);
    } catch {
      failed.push(id);
    }
  });

  state.tours = state.tours.filter((tour) => !succeeded.includes(tour.id));
  succeeded.forEach((id) => state.selectedIds.delete(id));
  if (succeeded.includes(state.selectedTourId)) {
    deselectTour();
  }

  if (failed.length === 0) {
    state.selectMode = false;
    toast(
      succeeded.length === 1
        ? t('toast.tourDeleted')
        : t('toast.toursDeleted', { count: succeeded.length }),
      'success',
    );
  } else if (succeeded.length === 0) {
    toast(t('toast.tourDeleteError'), 'error');
  } else {
    toast(
      t('toast.toursDeletedPartial', {
        deleted: succeeded.length,
        total: ids.length,
      }),
      'error',
    );
  }

  renderSidebar();
  await renderAllHeatmap();
}
```

- [ ] **Step 2: Wire the click listener**

In `frontend/src/app.js`, replace:

```js
elBtnSelectMode.addEventListener('click', enterSelectMode);
elBtnCancelSelect.addEventListener('click', exitSelectMode);
```

with:

```js
elBtnSelectMode.addEventListener('click', enterSelectMode);
elBtnCancelSelect.addEventListener('click', exitSelectMode);
elBtnDeleteSelected.addEventListener('click', deleteSelectedTours);
```

- [ ] **Step 3: Add i18n keys to all 7 locale files**

In `frontend/src/locales/en.json`, replace:

```json
  "toast.tourDeleteError": "Could not delete the tour.",
```

with:

```json
  "toast.tourDeleteError": "Could not delete the tour.",
  "toast.toursDeleted": "{count} tours deleted.",
  "toast.toursDeletedPartial": "{deleted} of {total} tours deleted.",
```

In `frontend/src/locales/en.json`, replace:

```json
  "confirm.deleteTour": "Delete this tour? This cannot be undone.",
```

with:

```json
  "confirm.deleteTour": "Delete this tour? This cannot be undone.",
  "confirm.deleteTours": "Delete the selected tours? This cannot be undone.",
```

In `frontend/src/locales/de.json`, replace:

```json
  "toast.tourDeleteError": "Tour konnte nicht gelöscht werden.",
```

with:

```json
  "toast.tourDeleteError": "Tour konnte nicht gelöscht werden.",
  "toast.toursDeleted": "{count} Touren gelöscht.",
  "toast.toursDeletedPartial": "{deleted} von {total} Touren gelöscht.",
```

In `frontend/src/locales/de.json`, replace:

```json
  "confirm.deleteTour": "Diese Tour löschen? Das kann nicht rückgängig gemacht werden.",
```

with:

```json
  "confirm.deleteTour": "Diese Tour löschen? Das kann nicht rückgängig gemacht werden.",
  "confirm.deleteTours": "Ausgewählte Touren löschen? Das kann nicht rückgängig gemacht werden.",
```

In `frontend/src/locales/es.json`, replace:

```json
  "toast.tourDeleteError": "No se pudo eliminar la ruta.",
```

with:

```json
  "toast.tourDeleteError": "No se pudo eliminar la ruta.",
  "toast.toursDeleted": "{count} rutas eliminadas.",
  "toast.toursDeletedPartial": "{deleted} de {total} rutas eliminadas.",
```

In `frontend/src/locales/es.json`, replace:

```json
  "confirm.deleteTour": "¿Eliminar esta ruta? Esta acción no se puede deshacer.",
```

with:

```json
  "confirm.deleteTour": "¿Eliminar esta ruta? Esta acción no se puede deshacer.",
  "confirm.deleteTours": "¿Eliminar las rutas seleccionadas? Esta acción no se puede deshacer.",
```

In `frontend/src/locales/fr.json`, replace:

```json
  "toast.tourDeleteError": "Impossible de supprimer la sortie.",
```

with:

```json
  "toast.tourDeleteError": "Impossible de supprimer la sortie.",
  "toast.toursDeleted": "{count} sorties supprimées.",
  "toast.toursDeletedPartial": "{deleted} sur {total} sorties supprimées.",
```

In `frontend/src/locales/fr.json`, replace:

```json
  "confirm.deleteTour": "Supprimer cette sortie ? Cette action est irréversible.",
```

with:

```json
  "confirm.deleteTour": "Supprimer cette sortie ? Cette action est irréversible.",
  "confirm.deleteTours": "Supprimer les sorties sélectionnées ? Cette action est irréversible.",
```

In `frontend/src/locales/it.json`, replace:

```json
  "toast.tourDeleteError": "Impossibile eliminare il giro.",
```

with:

```json
  "toast.tourDeleteError": "Impossibile eliminare il giro.",
  "toast.toursDeleted": "{count} giri eliminati.",
  "toast.toursDeletedPartial": "{deleted} di {total} giri eliminati.",
```

In `frontend/src/locales/it.json`, replace:

```json
  "confirm.deleteTour": "Eliminare questo giro? L'operazione non può essere annullata.",
```

with:

```json
  "confirm.deleteTour": "Eliminare questo giro? L'operazione non può essere annullata.",
  "confirm.deleteTours": "Eliminare i giri selezionati? L'operazione non può essere annullata.",
```

In `frontend/src/locales/nl.json`, replace:

```json
  "toast.tourDeleteError": "Rit kon niet worden verwijderd.",
```

with:

```json
  "toast.tourDeleteError": "Rit kon niet worden verwijderd.",
  "toast.toursDeleted": "{count} ritten verwijderd.",
  "toast.toursDeletedPartial": "{deleted} van {total} ritten verwijderd.",
```

In `frontend/src/locales/nl.json`, replace:

```json
  "confirm.deleteTour": "Deze rit verwijderen? Dit kan niet ongedaan worden gemaakt.",
```

with:

```json
  "confirm.deleteTour": "Deze rit verwijderen? Dit kan niet ongedaan worden gemaakt.",
  "confirm.deleteTours": "Geselecteerde ritten verwijderen? Dit kan niet ongedaan worden gemaakt.",
```

In `frontend/src/locales/pt.json`, replace:

```json
  "toast.tourDeleteError": "Não foi possível eliminar o percurso.",
```

with:

```json
  "toast.tourDeleteError": "Não foi possível eliminar o percurso.",
  "toast.toursDeleted": "{count} percursos eliminados.",
  "toast.toursDeletedPartial": "{deleted} de {total} percursos eliminados.",
```

In `frontend/src/locales/pt.json`, replace:

```json
  "confirm.deleteTour": "Eliminar este percurso? Esta ação não pode ser revertida.",
```

with:

```json
  "confirm.deleteTour": "Eliminar este percurso? Esta ação não pode ser revertida.",
  "confirm.deleteTours": "Eliminar os percursos selecionados? Esta ação não pode ser revertida.",
```

- [ ] **Step 4: Run the i18n key-parity test, lint, and format checks**

Run the same three commands as Task 1 Step 10.

Expected: all pass.

- [ ] **Step 5: Manual smoke check**

With the dev stack still running (or restarted via `./buddy.sh development start-all`) and at least 3 tours present:

1. Click "Select", select 2 of the 3 tours, click "Delete" → a confirm dialog appears with the text "Delete the selected tours? This cannot be undone." (no count in the message).
2. Accept it → both selected tours disappear from the list and the map heatmap updates; a toast reads "2 tours deleted."; select mode exits automatically (checkboxes and the bar disappear).
3. Re-select a single tour and delete it → toast reads "Tour deleted." (the singular, pre-existing message — not "1 tours deleted.").
4. Open a tour's detail panel (not in select mode), then click "Select", check that same tour, and delete it → confirm the detail panel closes automatically.

Stop the stack after: `./buddy.sh development stop`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app.js frontend/src/locales/en.json frontend/src/locales/de.json frontend/src/locales/es.json frontend/src/locales/fr.json frontend/src/locales/it.json frontend/src/locales/nl.json frontend/src/locales/pt.json
git commit -m "feat: bulk-delete selected tours (#272)"
```

---

### Task 3: E2E coverage

**Files:**

- Modify: `e2e/pages/main-page.ts`
- Create: `e2e/tests-fullstack/multi-select-delete.spec.ts`

**Interfaces:**

- Consumes: the real running app from Tasks 1–2. Also consumes `toursContainer()`, `clearTours()`, `clearUsers()` from `e2e/tests-fullstack/usersDb.ts` (existing helpers, same ones `pagination.spec.ts`/`photo-pins.spec.ts` use to seed Cosmos directly).
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Add select-mode locators and actions to the page object**

In `e2e/pages/main-page.ts`, replace:

```ts
    deleteTour(): Promise<void>;
    showPins(visible: boolean): Promise<void>;
    pagerPrev(): Promise<void>;
    pagerNext(): Promise<void>;
```

with:

```ts
    deleteTour(): Promise<void>;
    enterSelectMode(): Promise<void>;
    toggleTourSelection(name: string): Promise<void>;
    deleteSelected(): Promise<void>;
    cancelSelect(): Promise<void>;
    showPins(visible: boolean): Promise<void>;
    pagerPrev(): Promise<void>;
    pagerNext(): Promise<void>;
```

In `e2e/pages/main-page.ts`, replace:

```ts
      editTour: Locator;
      deleteTour: Locator;
    };
    list: {
      container: Locator;
      names: Locator;
      count: Locator;
      empty: Locator;
    };
```

with:

```ts
      editTour: Locator;
      deleteTour: Locator;
      selectMode: Locator;
      deleteSelected: Locator;
      cancelSelect: Locator;
    };
    list: {
      container: Locator;
      names: Locator;
      count: Locator;
      empty: Locator;
    };
    selection: {
      bar: Locator;
      count: Locator;
    };
```

In `e2e/pages/main-page.ts`, replace:

```ts
      editTour: page.locator('#btn-edit-tour'),
      deleteTour: page.locator('#btn-delete-tour'),
    },
    list: {
      container: page.locator('#tour-list'),
      names: page.locator('#tour-list .tour-item-name'),
      count: page.locator('#tour-count'),
      empty: page.locator('#no-tours'),
    },
```

with:

```ts
      editTour: page.locator('#btn-edit-tour'),
      deleteTour: page.locator('#btn-delete-tour'),
      selectMode: page.locator('#btn-select-mode'),
      deleteSelected: page.locator('#btn-delete-selected'),
      cancelSelect: page.locator('#btn-cancel-select'),
    },
    list: {
      container: page.locator('#tour-list'),
      names: page.locator('#tour-list .tour-item-name'),
      count: page.locator('#tour-count'),
      empty: page.locator('#no-tours'),
    },
    selection: {
      bar: page.locator('#selection-bar'),
      count: page.locator('#selection-count'),
    },
```

In `e2e/pages/main-page.ts`, replace:

```ts
    deleteTour: async () => {
      page.once('dialog', (d) => d.accept());
      await locators.buttons.deleteTour.click();
    },
```

with:

```ts
    deleteTour: async () => {
      page.once('dialog', (d) => d.accept());
      await locators.buttons.deleteTour.click();
    },
    enterSelectMode: async () => locators.buttons.selectMode.click(),
    toggleTourSelection: async (name: string) => {
      await locators.list.container.locator('.tour-item', { hasText: name }).click();
    },
    deleteSelected: async () => {
      page.once('dialog', (d) => d.accept());
      await locators.buttons.deleteSelected.click();
    },
    cancelSelect: async () => locators.buttons.cancelSelect.click(),
```

- [ ] **Step 2: Write the test**

Create `e2e/tests-fullstack/multi-select-delete.spec.ts`:

```ts
import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #272: select multiple tours in the sidebar and delete them together, from
// across a page boundary, without disturbing the ones left unselected.

buddyTest.describe('multi-select bulk delete', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    // 22 tours: PAGE_SIZE is 20, so this spans exactly 2 pages.
    const docs = Array.from({ length: 22 }, (_, i) => ({
      id: `multiselect-tour-${i + 1}`,
      userId: 'local-dev-user',
      name: `MultiSelect Tour ${String(i + 1).padStart(2, '0')}`,
      distance: 10,
      createdAt: new Date(now - i * 60_000).toISOString(),
    }));
    await Promise.all(docs.map((doc) => toursContainer().items.create(doc)));
  });

  buddyTest('selects across a page boundary and deletes only those', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.count).toHaveText('22');

    await on(page).main.do.enterSelectMode();
    await expect(on(page).main.locators.selection.bar).toBeVisible();
    await expect(on(page).main.locators.selection.count).toHaveText('0 selected');

    // Page 1: sorted newest-first by default (date-desc). Tour 01 was created
    // with the most recent timestamp (i=0 → createdAt = now), so it's first
    // on page 1. Tour 22 has the oldest timestamp (i=21 → now - 21min), so
    // it's the very last item overall — on page 2.
    await on(page).main.do.toggleTourSelection('MultiSelect Tour 01');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');

    await on(page).main.do.pagerNext();
    await on(page).main.do.toggleTourSelection('MultiSelect Tour 22');
    await expect(on(page).main.locators.selection.count).toHaveText('2 selected');

    await on(page).main.do.deleteSelected();

    await expect(on(page).main.locators.list.container).not.toContainText('MultiSelect Tour 01');
    await expect(on(page).main.locators.list.container).not.toContainText('MultiSelect Tour 22');
    await expect(on(page).main.locators.list.count).toHaveText('20');
    // Select mode auto-exits once every selected tour succeeds.
    await expect(on(page).main.locators.selection.bar).toBeHidden();
  });

  buddyTest('cancel exits select mode without deleting anything', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.enterSelectMode();
    // Tour 01 is guaranteed to be on page 1 (see the timestamp comment above).
    await on(page).main.do.toggleTourSelection('MultiSelect Tour 01');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');

    await on(page).main.do.cancelSelect();

    await expect(on(page).main.locators.selection.bar).toBeHidden();
    await expect(on(page).main.locators.list.count).toHaveText('22');
  });
});
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd e2e && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the test**

Run: `cd e2e && npm run test:fullstack -- multi-select-delete.spec.ts` (requires the local stack: Cosmos emulator + Azurite + a running Functions host — start with `./buddy.sh development start-all` if not already running).
Expected: PASS, both tests green.

- [ ] **Step 5: Format check**

Run: `cd e2e && ./node_modules/.bin/prettier --check 'pages/main-page.ts' 'tests-fullstack/multi-select-delete.spec.ts'`
Expected: no issues. If it reports formatting problems, run the equivalent with `--write` and re-check.

- [ ] **Step 6: Commit**

```bash
git add e2e/pages/main-page.ts e2e/tests-fullstack/multi-select-delete.spec.ts
git commit -m "test(e2e): cover multi-select bulk delete (#272)"
```

---

## Final verification

- [ ] `cd frontend && npm test` — all unit tests pass (no regressions; this feature adds no new Vitest tests beyond the i18n key-parity check already covered by Tasks 1–2).
- [ ] `cd e2e && npm run test:fullstack` — full fullstack suite passes, including the new multi-select-delete tests.
- [ ] `prek run --all-files` (or on the changed files) — all hooks pass.
- [ ] Manual check in a real browser with the local stack running: the full flow from Task 1 Step 11 + Task 2 Step 5, plus confirm the existing single-tour delete button (detail panel) still works unchanged.
- [ ] Open a PR with `Fixes #272` in the body so it auto-closes on merge.
