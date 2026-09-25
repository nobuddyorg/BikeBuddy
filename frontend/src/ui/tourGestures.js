import { clampSwipe, exceedsTolerance, isVerticalIntent } from '../lib/gestures.js';
import { state } from './state.js';
import { sidebar, tourList } from './dom.js';
import { createClickGuard } from './clickGuard.js';

// Long-press is mobile's only way into select mode; Pointer Events cover mouse holds too.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const SWIPE_ACTION_THRESHOLD_PX = 72;

// The selection bar shifts every row, so the ghost click can land anywhere in the sidebar.
const guardAgainstGhostClick = createClickGuard({ scope: sidebar, indicator: tourList });

// Fires on pointerup: re-rendering mid-press retargets the pending click to the new row.
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

// Release only reads the final dx, so dragging back below the threshold just snaps back.
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
      start = undefined; // a scroll belongs to the browser
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
    // The re-rendered list would take the ghost click on the row that moved up.
    guardAgainstGhostClick();
    await onSwipeRight();
  });

  content.addEventListener('pointercancel', reset);
  content.addEventListener('pointerleave', () => {
    if (dragging) reset();
  });
}
