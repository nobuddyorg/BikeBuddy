import { expect, fullstackTest } from './fullstack-test';

// The topmost row on purpose: select mode's bar shifts rows down, so a ghost click could hit Cancel.

fullstackTest.describe('long-press to enter select mode', () => {
  // Chromium synthesizes touch pointers and ghost clicks reliably only on a touch context.
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
