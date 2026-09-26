import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

staticTest.use({
  mockAccount: {
    tours: [
      mockTour({ id: '11111111-1111-4111-8111-111111111111', name: 'Alpine Loop', distance: 42 }),
      mockTour({ id: '22222222-2222-4222-8222-222222222222', name: 'Coastal Run', distance: 8 }),
    ],
  },
});

staticTest(
  'the ride statistics open over every tour, accessibly, and close',
  async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.openStats();

    await expect(on(page).modal.stats()).toBeVisible();
    await expect(on(page).modal.stats.locators.totalCount).toHaveText('2');
    await expect(on(page).modal.stats.locators.totalDistance).toContainText('50');
    await on(page).a11y.check('stats modal');

    await on(page).modal.stats.do.close();
    await expect(on(page).modal.stats()).toBeHidden();
  },
);
