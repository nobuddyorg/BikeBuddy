import { expect, mockPhoto, mockTour, staticTest } from '../fixtures/api-mocks';

// Only the photos around the view get a pin (#580): a long ride history holds thousands.

staticTest.use({
  mockAccount: {
    tours: [
      mockTour({
        id: '55555555-5555-4555-8555-555555555555',
        name: 'Munich Tour',
        heatmapData: [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
        images: [
          mockPhoto({ id: '66666666-6666-4666-8666-666666666666', lat: 48.15, lon: 11.55 }),
          // Taken on another continent: far outside the map's view of the ride.
          mockPhoto({ id: '77777777-7777-4777-8777-777777777777', lat: -33.9, lon: 151.2 }),
        ],
      }),
    ],
  },
});

staticTest('pins only the photos around the map view', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();
  await expect(on(page).list.locators.names).toHaveText(['Munich Tour']);

  await on(page).map.do.showPins();

  await expect(on(page).map.locators.pins.markers).toHaveCount(1);
});
