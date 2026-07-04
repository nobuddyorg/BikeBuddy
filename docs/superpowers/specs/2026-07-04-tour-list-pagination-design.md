# Tour list pagination — design

**Issue:** [#230](https://github.com/nobuddyorg/BikeBuddy/issues/230)
**Status:** Approved, ready for implementation plan

## Problem

The sidebar tour list (`frontend/src/app.js` `renderSidebar()`) renders every tour returned by `GET /api/tours` in one unbroken `<ul>`, filtered/sorted client-side via `visibleTours()` (`frontend/src/lib/tours.js`). With enough tours the list becomes an unwieldy, unbounded scroll — per the issue: "with too many tracks/tours a pagination is required."

## Goals

- The sidebar list shows at most a fixed number of tours at a time, with Prev/Next controls to move between pages.
- Search and sort keep working exactly as today, just applied before paging.
- No backend changes required.

## Non-goals

- No backend/API pagination (skip/limit or continuation tokens on `GetTours`) — the list payload already excludes `heatmapData`/`images` (per `CLAUDE.md`), so even hundreds of tours is a small response; client-side paging of an already-fetched array is sufficient.
- No numbered page-button widget (`1 2 3 ...`) — a simple Prev/Next + "Page X of Y" label avoids truncation logic for large page counts.
- No change to the "Show All" button or heatmap rendering behavior.

## Design

**Pure pagination helper** — `frontend/src/lib/tours.js` gets a new function alongside `visibleTours`/`fuzzyMatch`:

```js
export const PAGE_SIZE = 20;

// Slices `items` to one page, clamping `page` into [1, totalPages] so a stale
// page number (after a search/sort change shrinks the result set) never
// produces an out-of-range slice.
export function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: clamped, totalPages };
}
```

**Wiring into `renderSidebar()`** (`frontend/src/app.js`):

1. Add `page: 1` to `state`.
2. `renderSidebar()` computes `visible = visibleTours(...)` (unchanged), then `const { items, page, totalPages } = paginate(visible, state.page, PAGE_SIZE)`, and renders `items` instead of the full `visible` array.
3. If `state.page !== page` (clamping actually changed it — e.g. the last tour on the final page was deleted), write the clamped value back to `state.page` so the pager label stays consistent without an extra render pass.
4. A new pager element, `#tour-pager` (sibling of `#tour-list` in `index.html`, same `hidden`-class show/hide convention as `#tour-controls`), holds a Prev button, a `Page {page} of {totalPages}` label, and a Next button. Hidden whenever `totalPages <= 1`; Prev disabled on page 1, Next disabled on the last page (same disabled-button pattern used elsewhere, e.g. modal submit buttons).
5. The search input (`elTourSearch`'s `input` handler) and sort `<select>`'s `change` handler both already call `renderSidebar()` directly after updating `state.search`/`state.sort` — add `state.page = 1` right before that call in both, since a new filter/sort naturally should start from page 1. Tour add/delete do **not** need an explicit reset: `paginate()`'s clamping already keeps `state.page` valid.

**Markup addition** (`frontend/src/index.html`, after the `<ul id="tour-list">`):

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

`tour-pager-label`'s text is set in JS (`t('sidebar.pagerLabel', { page, totalPages })`-style interpolation, matching the existing i18n engine's dynamic-string usage), not `data-i18n`, since it embeds numbers.

## Testing plan

- Unit tests (`frontend/test/tours.test.js`, extending the existing `visibleTours`/`fuzzyMatch` coverage): `paginate()` — empty input (1 page, 0 items), exact page-size boundary, a page beyond `totalPages` clamps to the last page, a single page hides correctly (`totalPages === 1`).
- E2E: the static UI suite (`e2e/tests/`) can't cover this — its dev-mode fallback returns zero tours (no backend, `/api/tours` 404s). Add a new full-stack test in `e2e/tests-fullstack/` that seeds 25+ tours directly into the Cosmos `tours` container (same direct-seed pattern as `e2e/tests-fullstack/photo-pins.spec.ts`), then verifies: first page shows 20 tours with Prev disabled, Next advances to page 2 showing the remaining 5 with Next disabled, and typing a search query that matches only a few tours resets to page 1 and hides the pager.
