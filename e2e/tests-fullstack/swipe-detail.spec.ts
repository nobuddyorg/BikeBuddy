import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #308 removed swipe-left-to-open-details in favor of a plain tap opening it
// directly (see long-press-select.spec.ts) — this only guards that a left
// swipe is now inert rather than a half-working leftover gesture.

buddyTest.describe('swiping left on a tour row', () => {
  buddyTest.use({ hasTouch: true });

  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    await toursContainer().items.create({
      id: '55555555-5555-4555-8555-555555555555',
      userId: 'local-dev-user',
      name: 'Swipe Tour A',
      distance: 5,
      createdAt: new Date().toISOString(),
    });
  });

  buddyTest('is a no-op — the row snaps back and no panel opens', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.swipeTour('Swipe Tour A', -120);

    await expect(on(page).main.locators.detail.panel).toBeHidden();
    // The row must still open normally afterwards — the swipe shouldn't
    // leave it in a stuck or half-transformed state.
    await on(page).main.do.tapTour('Swipe Tour A');
    await expect(on(page).main.locators.detail.name).toHaveText('Swipe Tour A');
  });
});
