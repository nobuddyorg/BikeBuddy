import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #275: long-press enters select mode, mobile's replacement for the Select
// button. #310: a plain tap only highlights — the panel is swipe-left's job
// (swipe-detail.spec.ts). Mouse clicks are unaffected by either.
//
// The topmost row is the primary case on purpose. Entering select mode reveals
// #selection-bar above the list and shifts every row down mid-gesture, so the
// trailing ghost click's fixed coordinates can land on the bar itself — on
// Cancel, worst case. Only genuine touch events catch it.

buddyTest.describe('long-press to enter select mode', () => {
  // Chromium's touch-to-pointer translation and ghost-click synthesis are not
  // worth trusting on a context never marked touch-capable.
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
      // A long-press, not a tap: the panel must stay shut.
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

      // Touch-only context, so swipe-left rather than selectTour's mouse click.
      await on(page).main.do.swipeTour('Long Press Tour B', -120);
      await expect(on(page).main.locators.detail.name).toHaveText('Long Press Tour B');

      // Chromium's gesture recognizer needs settle time *before* a new touch
      // sequence that follows a raw-CDP drag. Without it, on CI, the next tap
      // dispatched cleanly but its compatibility click never arrived, so
      // waiting after the tap could not help. Nothing else here chains two
      // independent touch gestures back to back.
      await page.waitForTimeout(500);
      await on(page).main.do.tapTour('Long Press Tour A');

      // Left open, the panel would still name Tour B while its Edit/Delete
      // buttons acted on Tour A.
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

      // Short click while already in select mode still toggles.
      await on(page).main.do.toggleTourSelection('Long Press Tour B');
      await expect(on(page).main.locators.selection.count).toHaveText('2 selected');
    },
  );
});
