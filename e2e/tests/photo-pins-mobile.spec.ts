import { expect, mockPhoto, mockTour, staticTest } from '../fixtures/api-mocks';

// The full-stack photo-pins spec runs at desktop width only; the toggle must work on a phone too.

staticTest.use({
  viewport: { width: 390, height: 844 },
  mockAccount: {
    tours: [
      mockTour({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Geotagged Tour',
        heatmapData: [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
        // Two photos at the same spot → fanned into two markers.
        images: [
          mockPhoto({ id: '33333333-3333-4333-8333-333333333333', lat: 48.1, lon: 11.5 }),
          mockPhoto({ id: '44444444-4444-4444-8444-444444444444', lat: 48.1, lon: 11.5 }),
        ],
      }),
    ],
  },
});

staticTest('toggle is visible and reveals pins on the mobile map view', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();
  await expect(on(page).list.locators.names).toHaveText(['Geotagged Tour']);

  await on(page).main.do.openMobileMap();

  // Must be tappable, not covered, on the phone-width map view.
  await expect(on(page).map.locators.pins.toggle).toBeVisible();
  await on(page).map.do.showPins();
  await expect(on(page).map.locators.pins.markers).toHaveCount(2);
  await on(page).a11y.check('mobile map with photo pins');
});
