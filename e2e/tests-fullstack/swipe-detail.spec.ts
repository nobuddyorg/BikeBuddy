import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #308: swipe a tour row left (touch only) to open the detail panel for that
// tour directly, mirroring swipe-delete.spec.ts's right-swipe delete. A plain
// tap no longer opens the detail panel on touch (see long-press-select.spec.ts).

buddyTest.describe('swipe to view tour details', () => {
  buddyTest.use({ hasTouch: true });

  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    await toursContainer().items.create({
      id: '55555555-5555-4555-8555-555555555555',
      userId: 'local-dev-user',
      name: 'Swipe Tour A',
      distance: 5,
      createdAt: new Date(now).toISOString(),
    });
    await toursContainer().items.create({
      id: '66666666-6666-4666-8666-666666666666',
      userId: 'local-dev-user',
      name: 'Swipe Tour B',
      distance: 5,
      createdAt: new Date(now - 60_000).toISOString(),
    });
  });

  buddyTest('swiping left past the threshold opens details for that tour', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.names).toHaveCount(2);

    await on(page).main.do.swipeTour('Swipe Tour B', -120);

    await expect(on(page).main.locators.detail.panel).toBeVisible();
    await expect(on(page).main.locators.detail.name).toHaveText('Swipe Tour B');
  });

  buddyTest(
    'a left swipe short of the threshold snaps back with no action',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      // 30px is well under bindTourSwipe's 72px threshold.
      await on(page).main.do.swipeTour('Swipe Tour A', -30);

      await expect(on(page).main.locators.detail.panel).toBeHidden();
      // The row must still open normally afterwards — snapping back shouldn't
      // leave it in a stuck or half-transformed state.
      await on(page).main.do.swipeTour('Swipe Tour A', -120);
      await expect(on(page).main.locators.detail.name).toHaveText('Swipe Tour A');
    },
  );

  buddyTest('swiping left while in select mode is a no-op', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.longPressTour('Swipe Tour A');
    await expect(on(page).main.locators.selection.bar).toBeVisible();

    await on(page).main.do.swipeTour('Swipe Tour A', -120);

    await expect(on(page).main.locators.detail.panel).toBeHidden();
    await expect(on(page).main.locators.selection.bar).toBeVisible();
  });
});
