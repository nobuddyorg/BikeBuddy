import { state } from './state.js';
import { elSidebar } from './dom.js';

// Long-press is mobile's only way into select mode once the Select button is
// hidden there. Wired unconditionally — Pointer Events cover mouse
// click-and-hold too, alongside the button.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const SWIPE_ACTION_THRESHOLD_PX = 72;

// Revealing the selection bar shifts every row down, so a long-press's ghost
// click can land anywhere in the sidebar — even on Cancel/Delete — not just on
// #tour-list. elSidebar is the nearest ancestor that survives the re-render and
// contains both. The timeout covers the browsers that suppress the ghost click
// entirely, where nothing would otherwise clear the flag.
let suppressNextTourClick = false;

function suppressNextTourClickOnce() {
  suppressNextTourClick = true;
  setTimeout(() => {
    suppressNextTourClick = false;
  }, 400);
}

elSidebar.addEventListener(
  'click',
  (e) => {
    if (suppressNextTourClick) {
      e.stopImmediatePropagation();
      suppressNextTourClick = false;
    }
  },
  true,
);

// onLongPress fires from pointerup, not from the 500ms timer: firing it while
// the pointer is still down lets its re-render destroy the <li> mid-gesture,
// and the browser then retargets the pending pointerup/click to whatever has
// taken its place.
export function bindLongPress(el, onLongPress) {
  let timer = null;
  let start = null;
  let ready = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    start = null;
    ready = false;
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ready = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      ready = true;
    }, LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) cancel();
  });

  el.addEventListener('pointerup', () => {
    clearTimeout(timer);
    timer = null;
    start = null;
    if (ready) {
      ready = false;
      if (onLongPress()) suppressNextTourClickOnce();
    }
  });
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
}

// Touch-only, like bindLongPress. Dragging contentEl right uncovers the
// delete background; past SWIPE_ACTION_THRESHOLD_PX on release, it deletes.
// Anything less snaps back — release only ever looks at the final dx, so a
// drag-back needs no cancelled state of its own.
export function bindTourSwipe(contentEl, onSwipeRight) {
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
    // Only the delete background exists now, so leftward drags are clamped
    // to 0 instead of revealing anything on that side.
    const maxDx = contentEl.offsetWidth / 2;
    const clampedDx = Math.max(0, Math.min(maxDx, dx));
    contentEl.style.transform = `translateX(${clampedDx}px)`;
  });

  contentEl.addEventListener('pointerup', async (e) => {
    if (!dragging) {
      start = null;
      return;
    }
    const dx = e.clientX - start.x;
    reset();
    if (dx >= SWIPE_ACTION_THRESHOLD_PX) {
      // Once the list re-renders without this tour, a trailing ghost click
      // would land on whatever row took its place.
      suppressNextTourClickOnce();
      await onSwipeRight();
    }
  });

  contentEl.addEventListener('pointercancel', reset);
  contentEl.addEventListener('pointerleave', () => {
    if (dragging) reset();
  });
}
