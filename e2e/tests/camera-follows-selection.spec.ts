import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// Leaflet ignores a new view while a zoom animation runs; the app applies the latest one after it.

staticTest.use({
  mockAccount: {
    tours: [
      mockTour({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Camera Tour A',
        createdAt: '2026-06-02T08:00:00.000Z',
        heatmapData: [
          [48.1, 11.5],
          [48.11, 11.51],
        ],
      }),
      mockTour({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Camera Tour Tiny',
        createdAt: '2026-06-01T08:00:00.000Z',
        // Inside A: Leaflet animates a zoom only when the new centre is near the current one.
        heatmapData: [
          [48.105, 11.505],
          [48.106, 11.506],
        ],
      }),
    ],
  },
});

staticTest(
  'a tour picked while the camera still zooms to another one ends in view',
  async ({ on, page }) => {
    const map = on(page).map();
    await page.goto('/');
    await on(page).list.row('Camera Tour A').do.click();
    await expect(on(page).detail.locators.name).toHaveText('Camera Tour A');
    await expect(map).not.toHaveAttribute('data-zooming');
    const tourAZoom = await map.getAttribute('data-zoom');

    // The tiny tour zooms in further; picking A again as its panel opens lands mid-animation.
    await on(page).list.row('Camera Tour Tiny').do.click();
    await expect(on(page).detail.locators.name).toHaveText('Camera Tour Tiny');
    await on(page).list.row('Camera Tour A').do.click();
    await expect(on(page).detail.locators.name).toHaveText('Camera Tour A');

    await expect(map).not.toHaveAttribute('data-zooming');
    await expect(map).toHaveAttribute('data-zoom', tourAZoom ?? '');
  },
);
