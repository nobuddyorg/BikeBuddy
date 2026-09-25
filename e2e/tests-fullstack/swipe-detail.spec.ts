import { expect, fullstackTest } from './fullstack-test';

// #308 removed swipe-left-to-open-details in favor of a plain tap opening it
// directly (see long-press-select.spec.ts) — this only guards that a left
// swipe is now inert rather than a half-working leftover gesture.

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

    // The row must still open normally afterwards — the swipe shouldn't
    // leave it in a stuck or half-transformed state.
    await on(page).list.row('Swipe Tour A').do.tap();
    await expect(on(page).detail.locators.name).toHaveText('Swipe Tour A');
  });
});
