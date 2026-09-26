import { expect, mockPhoto, mockTour, staticTest } from '../fixtures/api-mocks';

staticTest.use({
  mockAccount: {
    tours: [
      mockTour({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Alpine Loop',
        createdAt: '2026-07-02T00:00:00.000Z',
        heatmapData: [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
        images: [mockPhoto({ id: '33333333-3333-4333-8333-333333333333', lat: 48.1, lon: 11.5 })],
      }),
      mockTour({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Coastal Run',
        distance: 7,
        // Close to Alpine Loop on purpose: the all-tours fit keeps the zoom where pins render.
        heatmapData: [
          [48.3, 11.8],
          [48.4, 11.9],
        ],
        // Taken within Alpine Loop's view, so only the selection, not the camera, hides its pin.
        images: [mockPhoto({ id: '44444444-4444-4444-8444-444444444444', lat: 48.2, lon: 11.6 })],
      }),
    ],
  },
});

staticTest.describe('closing the detail panel', () => {
  staticTest.beforeEach(async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
  });

  staticTest('drops the selection and widens pins back to every tour', async ({ on, page }) => {
    await on(page).map.do.showPins();
    await expect(on(page).map.locators.pins.markers).toHaveCount(2);

    await on(page).list.row('Alpine Loop').do.click();
    await expect(on(page).detail.locators.name).toHaveText('Alpine Loop');
    await expect(on(page).map.locators.pins.markers).toHaveCount(1);

    await on(page).detail.do.close();

    await expect(on(page).detail()).toBeHidden();
    await expect(on(page).list.locators.current).toHaveCount(0);
    await expect(on(page).map.locators.pins.markers).toHaveCount(2);
  });

  staticTest('clicking the already-open tour again closes it', async ({ on, page }) => {
    await on(page).list.row('Alpine Loop').do.click();
    await expect(on(page).detail.locators.name).toHaveText('Alpine Loop');

    await on(page).list.row('Alpine Loop').do.click();

    await expect(on(page).detail()).toBeHidden();
    await expect(on(page).list.locators.current).toHaveCount(0);
  });
});
