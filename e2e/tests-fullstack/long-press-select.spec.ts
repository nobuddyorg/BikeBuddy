import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #275: long-press enters select mode, mobile's replacement for the Select
// button. A plain tap opens the detail panel directly, the same as a mouse
// click (swipe-left-to-open-details was removed).
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
      await expect(on(page).list.locators.names.first()).toHaveText('Long Press Tour A');
      await expect(on(page).list.locators.selection.bar).toBeHidden();

      await on(page).list.row('Long Press Tour A').do.longPress();

      await expect(on(page).list.locators.selection.bar).toBeVisible();
      await expect(on(page).list.locators.selection.count).toHaveText('1 selected');
      // A long-press, not a tap: the panel must stay shut.
      await expect(on(page).detail.locators.name).toBeHidden();
    },
  );

  buddyTest('a mouse click still opens the detail panel, not select mode', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).list.row('Long Press Tour A').do.click();

    await expect(on(page).detail.locators.name).toHaveText('Long Press Tour A');
    await expect(on(page).list.locators.selection.bar).toBeHidden();
  });

  buddyTest(
    'a touch tap opens the detail panel directly, like a mouse click',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).list.row('Long Press Tour A').do.tap();

      await expect(on(page).list.row('Long Press Tour A').locators.content).toHaveAttribute(
        'aria-current',
        'true',
      );
      await expect(on(page).list.locators.selection.bar).toBeHidden();
      await expect(on(page).detail.locators.name).toHaveText('Long Press Tour A');
    },
  );

  buddyTest(
    'tapping a different row switches the detail panel to that tour',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).list.row('Long Press Tour B').do.tap();
      await expect(on(page).detail.locators.name).toHaveText('Long Press Tour B');

      await on(page).list.row('Long Press Tour A').do.tap();

      // Edit/Delete on the panel must act on the newly tapped tour, not the
      // one that was open before.
      await expect(on(page).detail.locators.name).toHaveText('Long Press Tour A');
      await expect(on(page).list.row('Long Press Tour A').locators.content).toHaveAttribute(
        'aria-current',
        'true',
      );
    },
  );

  buddyTest(
    'after a long press, click-to-toggle in select mode still works normally',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).list.row('Long Press Tour A').do.longPress();
      await expect(on(page).list.locators.selection.count).toHaveText('1 selected');

      // Short click while already in select mode still toggles.
      await on(page).list.row('Long Press Tour B').do.click();
      await expect(on(page).list.locators.selection.count).toHaveText('2 selected');
    },
  );
});
