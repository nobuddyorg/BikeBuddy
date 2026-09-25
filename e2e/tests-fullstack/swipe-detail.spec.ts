import { expect, fullstackTest } from './fullstack-test';

fullstackTest.describe('swiping left on a tour row', () => {
  fullstackTest.use({ hasTouch: true });

  fullstackTest.beforeEach(async ({ seed }) => {
    await seed.tour({ name: 'Swipe Tour A', time: '2026-06-01T08:00:00Z' });
  });

  fullstackTest('is a no-op — the row snaps back and no panel opens', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).list.row('Swipe Tour A').do.swipe(-120);

    await expect(on(page).detail()).toBeHidden();

    // Not left stuck or half-transformed.
    await on(page).list.row('Swipe Tour A').do.tap();
    await expect(on(page).detail.locators.name).toHaveText('Swipe Tour A');
  });
});
