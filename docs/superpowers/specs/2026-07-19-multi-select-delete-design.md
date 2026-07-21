# Multi-select & bulk delete — design

**Issue:** [#272](https://github.com/nobuddyorg/BikeBuddy/issues/272)
**Status:** Approved, ready for implementation plan

## Problem

Tours can only be deleted one at a time, from the "Tour löschen" button inside the detail panel (`deleteSelectedTour()` in `frontend/src/app.js`). Per the issue: "add possibility to delete multiple tours in one go."

## Goals

- Select any number of tours from the sidebar list and delete them together, with one confirmation and one result toast.
- Selection works across search/sort/pagination — a user can filter, select some, change the filter, select more, then delete.
- No backend changes.

## Non-goals

- No new batch API endpoint. `DELETE /api/tours/{tourId}` already exists (`functions/src/DeleteTour/index.js`) and is reused with bounded-concurrency client-side calls, the same pattern already used for photo uploads (`runWithConcurrency`, `frontend/src/lib/concurrency.js`).
- No change to the existing single-tour delete button in the detail panel.
- No always-visible per-row checkboxes — selection is an explicit mode (see below), to keep the default list uncluttered, especially in the cramped mobile sidebar strip.

## Design

**State** (`frontend/src/app.js`): add to `state`:

```js
selectMode: false,
selectedIds: new Set(),
```

**Entering/exiting select mode:**

- A "Select" toggle button in `.sidebar-header` (next to the "My Tours" title/count badge — currently empty space there) sets `state.selectMode = true` and re-renders.
- A "Cancel" action (in the new selection bar, see below) sets `state.selectMode = false`, clears `state.selectedIds`, and re-renders.

**List rendering (`createTourItem`, `renderSidebar`):**

- When `state.selectMode` is true, each `<li class="tour-item">` gets a leading checkbox reflecting `state.selectedIds.has(tour.id)`. The checkbox is visual only (`pointer-events: none`); the existing `li` click handler is the single source of interaction — in select mode it toggles membership in `state.selectedIds` instead of calling `selectTour(tour.id)`. This avoids double-toggle bugs from click bubbling between the checkbox and the row.
- Pagination/search/sort continue to operate on `visibleTours()`/`paginate()` unchanged; `state.selectedIds` is independent of what's currently rendered, so it survives page/filter changes.

**Selection action bar:** a new element between `#tour-controls` and `#tour-list` (same `hidden`-class show/hide convention as the rest of the sidebar), visible only in select mode:

- A count label: `t('sidebar.selectedCount', { count: state.selectedIds.size })`.
- `Delete` button, disabled when `state.selectedIds.size === 0`.
- `Cancel` button (see above).

**Delete flow:**

1. `Delete` click → `confirm(t('confirm.deleteTours'))` (no count needed in the message — the bar already shows it; sidesteps needing plural forms the i18n engine doesn't support).
2. On confirm, delete via `runWithConcurrency([...state.selectedIds], 3, (id) => apiFetch(`/api/tours/${id}`, { method: 'DELETE' }))`, collecting per-id success/failure (mirrors the existing `uploadOne` job-result pattern used for photo batches).
3. Remove succeeded IDs from `state.tours` and from `state.selectedIds`; failed IDs stay in `state.selectedIds` so the user can retry without reselecting.
4. If the open detail panel's tour was among the succeeded deletes, close it (same as `deleteSelectedTour`'s `deselectTour()` call).
5. Toast:
   - All succeeded, count === 1 → reuse `toast.tourDeleted` (avoids an awkward "1 tours deleted").
   - All succeeded, count > 1 → `toast.toursDeleted` ("{count} tours deleted.").
   - Partial → `toast.toursDeletedPartial` ("{deleted} of {total} tours deleted.").
   - All failed → `toast.tourDeleteError` (reused).
6. If `state.selectedIds` is now empty (everything succeeded), exit select mode automatically; otherwise stay in select mode with the failed items still checked.
7. `renderSidebar()` + `renderAllHeatmap()`, same as the existing single-delete path.

**i18n** — new keys added to all 7 locale files (en/de/es/fr/it/nl/pt):

- `sidebar.select` — "Select"
- `sidebar.selectedCount` — "{count} selected"
- `sidebar.deleteSelected` — "Delete"
- `sidebar.cancelSelect` — "Cancel"
- `confirm.deleteTours` — "Delete the selected tours? This cannot be undone."
- `toast.toursDeleted` — "{count} tours deleted."
- `toast.toursDeletedPartial` — "{deleted} of {total} tours deleted."

## Testing plan

- No new pure-logic unit tests expected — selection is a `Set` mutation plus existing render/delete plumbing, not new standalone logic worth extracting.
- Manual/Playwright verification of the UI flow (same approach used for the recent z-index fixes): enter select mode, select across a page change, delete, confirm the list/map/detail-panel update and the toast text for full-success, partial-failure, and single-item cases.
- Consider a full-stack e2e test in `e2e/tests-fullstack/` (matching `tour-list.spec.ts` / `pagination.spec.ts`'s direct-seed pattern) that seeds several tours, selects a subset across a page boundary, deletes, and asserts the remaining set — left for the implementation plan to size.
