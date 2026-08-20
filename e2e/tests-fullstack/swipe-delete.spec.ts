import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #289: swipe a tour row (touch only) to delete that single tour directly,
// with the same confirm-modal safety net as every other delete path.

buddyTest.describe('swipe to delete a tour', () => {
  buddyTest.use({ hasTouch: true });

  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    await toursContainer().items.create({
      id: '33333333-3333-4333-8333-333333333333',
      userId: 'local-dev-user',
      name: 'Swipe Tour A',
      distance: 5,
      createdAt: new Date(now).toISOString(),
    });
    await toursContainer().items.create({
      id: '44444444-4444-4444-8444-444444444444',
      userId: 'local-dev-user',
      name: 'Swipe Tour B',
      distance: 5,
      createdAt: new Date(now - 60_000).toISOString(),
    });
  });

  buddyTest(
    'swiping past the threshold and confirming deletes that tour only',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      await expect(on(page).main.locators.list.names).toHaveCount(2);

      await on(page).main.do.swipeTour('Swipe Tour A', 120);
      await on(page).main.locators.confirmModal.ok.click();

      await expect(on(page).main.locators.list.names).toHaveCount(1);
      await expect(on(page).main.locators.list.names.first()).toHaveText('Swipe Tour B');
    },
  );

  buddyTest('dismissing the confirm modal keeps the tour', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.swipeTour('Swipe Tour A', 120);
    await on(page).main.locators.confirmModal.cancel.click();

    await expect(on(page).main.locators.list.names).toHaveCount(2);
  });

  buddyTest('a swipe short of the threshold snaps back with no action', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    // 30px is well under bindTourSwipe's 72px threshold — no dialog
    // should even appear, so nothing to accept/dismiss here.
    await on(page).main.do.swipeTour('Swipe Tour A', 30);

    await expect(on(page).main.locators.list.names).toHaveCount(2);
    // The row must still open normally afterwards — snapping back shouldn't
    // leave it in a stuck or half-transformed state.
    await on(page).main.do.selectTour('Swipe Tour A');
    await expect(on(page).main.locators.detail.name).toHaveText('Swipe Tour A');
  });

  buddyTest('swiping while in select mode is a no-op', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.longPressTour('Swipe Tour A');
    await expect(on(page).main.locators.selection.bar).toBeVisible();

    await on(page).main.do.swipeTour('Swipe Tour A', 120);

    await expect(on(page).main.locators.list.names).toHaveCount(2);
    await expect(on(page).main.locators.selection.bar).toBeVisible();
  });
});
