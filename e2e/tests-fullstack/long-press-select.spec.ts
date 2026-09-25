import { expect, fullstackTest } from './fullstack-test';

// #275: long-press enters select mode, mobile's replacement for the Select
// button. A plain tap opens the detail panel directly, the same as a mouse
// click (swipe-left-to-open-details was removed).
//
// The topmost row is the primary case on purpose. Entering select mode reveals
// #selection-bar above the list and shifts every row down mid-gesture, so the
// trailing ghost click's fixed coordinates can land on the bar itself — on
// Cancel, worst case. Only genuine touch events catch it.

fullstackTest.describe('long-press to enter select mode', () => {
  // Chromium's touch-to-pointer translation and ghost-click synthesis are not
  // worth trusting on a context never marked touch-capable.
  fullstackTest.use({ hasTouch: true });

  fullstackTest.beforeEach(async ({ seed }) => {
    await seed.tour({ name: 'Long Press Tour A', time: '2026-06-02T08:00:00Z' });
    await seed.tour({ name: 'Long Press Tour B', time: '2026-06-01T08:00:00Z' });
  });

  fullstackTest(
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

  fullstackTest(
    'a mouse click still opens the detail panel, not select mode',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).list.row('Long Press Tour A').do.click();

      await expect(on(page).detail.locators.name).toHaveText('Long Press Tour A');
      await expect(on(page).list.locators.selection.bar).toBeHidden();
    },
  );

  fullstackTest(
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

  fullstackTest(
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

  fullstackTest(
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
