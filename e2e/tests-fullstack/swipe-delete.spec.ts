import { expect, fullstackTest } from './fullstack-test';

// #289: swipe a tour row (touch only) to delete that single tour directly,
// with the same confirm-modal safety net as every other delete path.

fullstackTest.describe('swipe to delete a tour', () => {
  fullstackTest.use({ hasTouch: true });

  fullstackTest.beforeEach(async ({ seed }) => {
    await seed.tour({ name: 'Swipe Tour A', time: '2026-06-02T08:00:00Z' });
    await seed.tour({ name: 'Swipe Tour B', time: '2026-06-01T08:00:00Z' });
  });

  fullstackTest(
    'swiping past the threshold and confirming deletes that tour only',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      await expect(on(page).list.locators.names).toHaveCount(2);

      await on(page).list.row('Swipe Tour A').do.swipeToDelete();
      await on(page).modal.confirm.do.confirm();

      await expect(on(page).list.locators.names).toHaveCount(1);
      await expect(on(page).list.locators.names.first()).toHaveText('Swipe Tour B');
    },
  );

  fullstackTest('dismissing the confirm modal keeps the tour', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).list.row('Swipe Tour A').do.swipeToDelete();
    await expect(on(page).modal.confirm()).toBeVisible();
    await on(page).a11y.check('delete confirm dialog');
    await on(page).modal.confirm.do.dismiss();

    await expect(on(page).list.locators.names).toHaveCount(2);
  });

  fullstackTest(
    'a swipe short of the threshold snaps back with no action',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      // 30px is well under bindTourSwipe's 72px threshold — no dialog
      // should even appear, so nothing to accept/dismiss here.
      await on(page).list.row('Swipe Tour A').do.swipe(30);

      await expect(on(page).list.locators.names).toHaveCount(2);
      // The row must still open normally afterwards — snapping back shouldn't
      // leave it in a stuck or half-transformed state.
      await on(page).list.row('Swipe Tour A').do.click();
      await expect(on(page).detail.locators.name).toHaveText('Swipe Tour A');
    },
  );

  fullstackTest('swiping while in select mode is a no-op', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).list.row('Swipe Tour A').do.longPress();
    await expect(on(page).list.locators.selection.bar).toBeVisible();

    await on(page).list.row('Swipe Tour A').do.swipe(120);

    await expect(on(page).modal.confirm()).toBeHidden();
    await expect(on(page).list.locators.names).toHaveCount(2);
    await expect(on(page).list.locators.selection.bar).toBeVisible();
  });
});
