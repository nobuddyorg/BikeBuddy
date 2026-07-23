# Swipe-to-delete a tour + icon-only selection buttons — design

**Issue:** [#289](https://github.com/nobuddyorg/BikeBuddy/issues/289)
**Status:** Approved, ready for implementation plan

## Problem

Deleting a single tour from the mobile sidebar list requires either opening its detail panel (`deleteSelectedTour()` in `frontend/src/app.js:850-865`) or entering multi-select mode via long-press just to delete one item. Per the issue: swiping a tour row (either direction) should delete it directly. While at it, the multi-select bar's Delete/Cancel buttons should become icon-only on mobile — they currently take full-text labels in a cramped strip.

## Goals

- Swipe a `.tour-item` row left or right (touch only) to delete that single tour, with the same `confirm()` safety net used by every other delete path in the app.
- A delete-icon layer is revealed behind the row as it's dragged, so the pending action is visible before release.
- Dragging back below the threshold before release cancels the gesture — no delete, row snaps back.
- `#btn-delete-selected` / `#btn-cancel-select` in the selection bar become icon-only at the existing mobile breakpoint (768px).

## Non-goals

- No mouse-drag support — swipe is touch-only, matching `bindLongPress`'s existing mobile-only role (per #275, long-press is documented as "mobile's only entry point" for select mode). Desktop keeps using the detail panel's Delete button.
- No swipe while `state.selectMode` is active — bulk delete already has its own bar; swipe and checkbox-select don't need to coexist.
- No new backend/API changes — reuses `DELETE /api/tours/{tourId}` via the same code path as the existing single-delete flow.
- No new i18n keys — the icon buttons reuse the existing `sidebar.deleteSelected` / `sidebar.cancelSelect` strings, now also as `aria-label`.
- No optimistic removal — the row stays in place until the DELETE request resolves, same as `deleteSelectedTour()` today.

## Design

### 1. `deleteTourById(id)` — small refactor first

Extract the body of `deleteSelectedTour()` (`app.js:850-865`) into a new `deleteTourById(id)` that takes an id instead of reading `state.selectedTourId`:

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

Both the detail panel's delete button and the new swipe gesture call `deleteTourById`, so there's one delete-with-confirm-and-toast path instead of two.

### 2. Delete-icon layer behind each row

`createTourItem` wraps the existing row content so a delete-icon backing layer can sit behind it:

- The `<li class="tour-item">` gets a new first child, `<div class="tour-item-delete-bg" aria-hidden="true">🗑</div>`, absolutely positioned to fill the row, `z-index` below the row's own content, background uses the existing `--color-danger`-family token (matching `.btn-danger`).
- The row's existing content (checkbox + `.tour-item-details`) is wrapped in a `.tour-item-content` div that sits above the delete-bg layer and is the element actually translated during the drag. This keeps the `li`'s own size/layout (border, click target) stable while only its content slides.

### 3. `bindSwipeToDelete(el, tour)` — new pointer-event handler

Added in `createTourItem` alongside the existing `bindLongPress(li, ...)` call (`app.js:565-570`), bound to `.tour-item-content`:

```js
const SWIPE_DELETE_THRESHOLD_PX = 72;

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
      start = null; // vertical scroll intent — let it scroll
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
      await deleteTourById(tour.id);
    }
  });

  contentEl.addEventListener('pointercancel', reset);
  contentEl.addEventListener('pointerleave', () => {
    if (dragging) reset();
  });
}
```

Behavior notes:

- Touch-only (`e.pointerType !== 'touch'` bails immediately) and disabled in select mode, per Non-goals.
- Live-translating `.tour-item-content` uncovers `.tour-item-delete-bg` proportionally — no separate "reveal" state to manage, the CSS just does it via z-index/positioning.
- Crossing the threshold on release goes straight to `deleteTourById`, which shows `confirm()`; if the user cancels that dialog, the row has already snapped back (`reset()` runs before the async confirm), so there's no dangling half-swiped state either way.
- Dragging back under the threshold before release is not a special case — release just checks `|dx|` once, same as any other release point, so "moved back = cancelled" falls out of the existing threshold check rather than needing separate tracking.
- This doesn't share any state with `bindLongPress`; `bindLongPress`'s own `LONG_PRESS_MOVE_TOLERANCE_PX` (10px) already cancels its timer well before a real swipe crosses the 72px delete threshold, so the two coexist on the same element without interference.

### 4. Icon-only selection-bar buttons (mobile)

`index.html:159-168` — wrap each button's label and add an aria-label + icon:

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

`data-i18n-aria-label` is new on these buttons (reusing the existing `sidebar.deleteSelected`/`sidebar.cancelSelect` keys — no new locale strings). It's required, not cosmetic: once `.btn-label` is hidden via `display: none` on mobile, the accessible name computed from visible subtree text would otherwise be lost.

CSS, at the existing 768px breakpoint (`style.css:1068`):

```css
@media (max-width: 768px) {
  .selection-bar-actions .btn-label {
    display: none;
  }
}
```

`.btn-icon` uses ✕ for cancel (matching the existing close-button glyph convention) and 🗑 for delete. These are a first pass — easy to swap for a different glyph at implementation time if they don't look right in context.

## Testing plan

- Vitest: unit-level check that `deleteTourById` extraction preserves `deleteSelectedTour()`'s existing behavior (confirm → API → state/toast), since it's now a shared path used by two callers.
- Fullstack e2e (`e2e/tests-fullstack/`): a new `swipe-delete.spec.ts` alongside the existing `long-press-select.spec.ts` and `multi-select-delete.spec.ts`, using the same Playwright/CDP touch-dispatch approach already proven for long-press. Cover: swipe past threshold + confirm → tour removed; swipe past threshold + dismiss confirm → tour stays; swipe below threshold released → row snaps back, no API call; swipe attempted while in select mode → no-op.
- Manual verification on a real mobile viewport for the drag feel (transform smoothness, delete-bg reveal) and for the icon-only selection bar layout at 768px and 480px.
