import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #275: long-press a tour row to enter select mode (mobile's replacement for
// the Select button), without disturbing normal short-click behavior. Also
// #310: on touch, a plain tap only highlights the row (like a desktop
// click) without opening the detail panel or entering select mode — the
// detail panel is reached via swipe-left instead (swipe-detail.spec.ts),
// and select mode via long-press only. A mouse click is unaffected either
// way.
//
// The topmost-row case is deliberately the primary test here: entering
// select mode reveals #selection-bar above the list, shifting every row
// down mid-gesture. For the topmost row specifically, the trailing ghost
// click's fixed screen coordinates can end up landing on the newly-revealed
// selection bar itself (in the worst case, on Cancel) instead of the tour
// row — this broke the implementation multiple times during development,
// caught only by driving genuine touch events, not mouse simulation.

buddyTest.describe('long-press to enter select mode', () => {
  // Genuine touch dispatch (see longPressTour in main-page.ts) exercises the
  // same code path as Playwright's own touchscreen API, which requires
  // hasTouch — matching it here removes any doubt about whether Chromium's
  // touch-to-pointer translation and ghost-click synthesis behave the same
  // on a context never marked touch-capable.
  buddyTest.use({ hasTouch: true });

  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    await toursContainer().items.create({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'local-dev-user',
      name: 'Long Press Tour A',
      distance: 5,
      createdAt: new Date(now).toISOString(),
    });
    await toursContainer().items.create({
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'local-dev-user',
      name: 'Long Press Tour B',
      distance: 5,
      createdAt: new Date(now - 60_000).toISOString(),
    });
  });

  buddyTest(
    'a long press on the topmost row enters select mode with that tour checked',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      // Default sort is date-desc (newest first): Tour A is topmost.
      await expect(on(page).main.locators.list.names.first()).toHaveText('Long Press Tour A');
      await expect(on(page).main.locators.selection.bar).toBeHidden();

      await on(page).main.do.longPressTour('Long Press Tour A');

      await expect(on(page).main.locators.selection.bar).toBeVisible();
      await expect(on(page).main.locators.selection.count).toHaveText('1 selected');
      // The detail panel must NOT have opened — this was a long-press, not a tap.
      await expect(on(page).main.locators.detail.name).not.toBeVisible();
    },
  );

  buddyTest('a mouse click still opens the detail panel, not select mode', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.selectTour('Long Press Tour A');

    await expect(on(page).main.locators.detail.name).toHaveText('Long Press Tour A');
    await expect(on(page).main.locators.selection.bar).toBeHidden();
  });

  buddyTest(
    'a touch tap only highlights the row — no select mode, no detail panel (#310)',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.tapTour('Long Press Tour A');

      await expect(
        on(page).main.locators.list.container.locator('.tour-item.active', {
          hasText: 'Long Press Tour A',
        }),
      ).toBeVisible();
      await expect(on(page).main.locators.selection.bar).toBeHidden();
      await expect(on(page).main.locators.detail.panel).toBeHidden();
    },
  );

  buddyTest(
    'tapping a different row closes an already-open detail panel (#310)',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      // Opens via swipe-left (mobile's own way in), not selectTour's mouse
      // click — this context is touch-only.
      await on(page).main.do.swipeTour('Long Press Tour B', -120);
      await expect(on(page).main.locators.detail.name).toHaveText('Long Press Tour B');

      await on(page).main.do.tapTour('Long Press Tour A');

      // The panel must close rather than keep showing Tour B while Tour A
      // is highlighted — that mismatch would point its Edit/Delete buttons
      // at Tour A instead of the Tour B still visibly named in the panel.
      await expect(on(page).main.locators.detail.panel).toBeHidden();
      await expect(
        on(page).main.locators.list.container.locator('.tour-item.active', {
          hasText: 'Long Press Tour A',
        }),
      ).toBeVisible();
    },
  );

  buddyTest(
    'after a long press, click-to-toggle in select mode still works normally',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.longPressTour('Long Press Tour A');
      await expect(on(page).main.locators.selection.count).toHaveText('1 selected');

      // A normal (short) click on a second tour, while already in select
      // mode, toggles it via the existing click handler — long-press didn't
      // break that path.
      await on(page).main.do.toggleTourSelection('Long Press Tour B');
      await expect(on(page).main.locators.selection.count).toHaveText('2 selected');
    },
  );
});
