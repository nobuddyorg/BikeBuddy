import { expect, type Locator, type Page } from '@playwright/test';
import { initConfirmModal } from './confirm-modal';

// ui/tourGestures.js's LONG_PRESS_MS (500) plus 250 ms for a busy runner's timer drift.
const LONG_PRESS_HOLD_MS = 500 + 250;
// Past ui/tourGestures.js's SWIPE_ACTION_THRESHOLD_PX (72).
const SWIPE_TO_DELETE_PX = 120;
const SWIPE_STEPS = 5;
const SWIPE_STEP_MS = 16;
// Chromium's velocity tracker treats a pointer still for over 40 ms as stopped.
const RELEASE_AFTER_STOP_MS = 200;
const RESTING_TRANSFORM = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/;

type Point = { x: number; y: number };
type TouchType = 'touchStart' | 'touchMove' | 'touchEnd';

export interface TourRow {
  /** Points to self (the list item). */
  (): Locator;
  /** High-level interactions; each returns once the state it causes is there. */
  do: {
    /** A mouse click: opens the tour, or toggles its checkbox in select mode. */
    click(): Promise<void>;
    /** A touch tap on a closed tour, which opens it. */
    tap(): Promise<void>;
    /** A touch hold, which enters select mode with this tour checked. */
    longPress(): Promise<void>;
    /** A horizontal touch drag of `dx` pixels, released; returns once the row has settled. */
    swipe(dx: number): Promise<void>;
    /** A right swipe past the threshold, which asks to delete the tour. */
    swipeToDelete(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    content: Locator;
    name: Locator;
  };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Raw CDP touch, not the mouse: gestures branch on pointer type, and a mouse hides ghost clicks.
async function touchGesture(
  page: Page,
  perform: (
    send: (touch: { type: TouchType; at?: Point; atMs?: number }) => Promise<void>,
  ) => Promise<void>,
) {
  const session = await page.context().newCDPSession(page);
  const startSeconds = Date.now() / 1000;
  await perform(async ({ type, at, atMs = 0 }) => {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: at ? [at] : [],
      timestamp: startSeconds + atMs / 1000,
    });
  });
  await session.detach();
}

async function centreOf(target: Locator): Promise<Point> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('tour row is not rendered');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function initTourRow(page: Page, { list, name }: { list: Locator; name: string }): TourRow {
  const nameElement = page
    .getByTestId('tour-item-name')
    .filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) });
  const root = list.getByTestId('tour-item').filter({ has: nameElement });
  const locators = {
    content: root.getByTestId('tour-item-content'),
    name: root.getByTestId('tour-item-name'),
  };
  const swipe = async (dx: number) => {
    const start = await centreOf(locators.content);
    await touchGesture(page, async (send) => {
      await send({ type: 'touchStart', at: start });
      for (let step = 1; step <= SWIPE_STEPS; step++) {
        const at = { x: start.x + (dx * step) / SWIPE_STEPS, y: start.y };
        await send({ type: 'touchMove', at, atMs: step * SWIPE_STEP_MS });
      }
      // Released after the finger stopped: no fling, whose cancelling tap would lose its click.
      await send({ type: 'touchEnd', atMs: SWIPE_STEPS * SWIPE_STEP_MS + RELEASE_AFTER_STOP_MS });
    });
    // The snap-back is a CSS transition; a no-op swipe never moved the row at all.
    await expect
      .poll(() => locators.content.evaluate((element) => getComputedStyle(element).transform))
      .toMatch(RESTING_TRANSFORM);
    await expect(list).not.toHaveAttribute('data-click-guard');
  };

  const interactions = {
    click: async () => locators.content.click(),
    tap: async () => {
      const at = await centreOf(locators.content);
      await touchGesture(page, async (send) => {
        await send({ type: 'touchStart', at });
        await send({ type: 'touchEnd' });
      });
      // The compatibility click arrives asynchronously; the tour is open once it has.
      await expect(locators.content).toHaveAttribute('aria-current', 'true');
    },
    longPress: async () => {
      const at = await centreOf(locators.content);
      await touchGesture(page, async (send) => {
        await send({ type: 'touchStart', at });
        // eslint-disable-next-line playwright/no-wait-for-timeout -- the hold is the gesture's input, timed by the app's own setTimeout
        await page.waitForTimeout(LONG_PRESS_HOLD_MS);
        await send({ type: 'touchEnd', atMs: LONG_PRESS_HOLD_MS });
      });
      await expect(locators.content).toHaveAttribute('aria-checked', 'true');
      // The ghost click must get its chance to land before a spec asserts the settled state.
      await expect(list).not.toHaveAttribute('data-click-guard');
    },
    swipe,
    swipeToDelete: async () => {
      await swipe(SWIPE_TO_DELETE_PX);
      await expect(initConfirmModal(page)()).toBeVisible();
    },
  };

  return Object.assign(() => root, { locators, do: interactions });
}
