import { clampSwipe, exceedsTolerance, isVerticalIntent } from '../lib/gestures.js';
import { state } from './state.js';
import { sidebar, tourList } from './dom.js';
import { createClickGuard } from './clickGuard.js';

// Long-press is mobile's only way into select mode once the Select button is
// hidden there. Wired unconditionally — Pointer Events cover mouse
// click-and-hold too, alongside the button.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const SWIPE_ACTION_THRESHOLD_PX = 72;

// Revealing the selection bar shifts every row down, so a long-press's ghost
// click can land anywhere in the sidebar — even on Cancel/Delete — not just on
// #tour-list. The sidebar is the nearest ancestor that survives the re-render
// and contains both.
const guardAgainstGhostClick = createClickGuard({ scope: sidebar, indicator: tourList });

// onLongPress fires from pointerup, not from the 500ms timer: firing it while
// the pointer is still down lets its re-render destroy the <li> mid-gesture,
// and the browser then retargets the pending pointerup/click to whatever has
// taken its place.
export function bindLongPress(element, onLongPress) {
  let timer;
  let start;
  let ready = false;

  const reset = () => {
    clearTimeout(timer);
    start = undefined;
    ready = false;
  };

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    ready = false;
    start = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      ready = true;
    }, LONG_PRESS_MS);
  });

  element.addEventListener('pointermove', (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (exceedsTolerance({ dx, dy, tolerancePx: LONG_PRESS_MOVE_TOLERANCE_PX })) reset();
  });

  element.addEventListener('pointerup', () => {
    const completed = ready;
    reset();
    if (completed && onLongPress()) guardAgainstGhostClick();
  });
  element.addEventListener('pointercancel', reset);
  element.addEventListener('pointerleave', reset);
}

// Touch-only, like bindLongPress. Dragging the row right uncovers the delete
// background; past SWIPE_ACTION_THRESHOLD_PX on release, it deletes.
// Anything less snaps back — release only ever looks at the final dx, so a
// drag-back needs no cancelled state of its own.
export function bindTourSwipe(content, onSwipeRight) {
  let start;
  let dragging = false;

  const reset = () => {
    content.style.transition = 'transform 0.2s';
    content.style.transform = 'translateX(0)';
    start = undefined;
    dragging = false;
  };

  content.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || state.selectMode) return;
    start = { x: event.clientX, y: event.clientY };
    dragging = false;
  });

  content.addEventListener('pointermove', (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!dragging && isVerticalIntent({ dx, dy })) {
      start = undefined; // a scroll — let the browser handle it
      return;
    }
    dragging = true;
    content.style.transition = 'none';
    const offset = clampSwipe({ dx, maxDx: content.offsetWidth / 2 });
    content.style.transform = `translateX(${offset}px)`;
  });

  content.addEventListener('pointerup', async (event) => {
    if (!dragging) {
      start = undefined;
      return;
    }
    const dx = event.clientX - start.x;
    reset();
    if (dx < SWIPE_ACTION_THRESHOLD_PX) return;
    // Once the list re-renders without this tour, a trailing ghost click
    // would land on whatever row took its place.
    guardAgainstGhostClick();
    await onSwipeRight();
  });

  content.addEventListener('pointercancel', reset);
  content.addEventListener('pointerleave', () => {
    if (dragging) reset();
  });
}
