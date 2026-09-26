import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// The load-time fit shows every track, and a tour without one is never in view: no panning needed.

staticTest.use({
  mockAccount: {
    tours: [
      mockTour({
        id: '55555555-5555-4555-8555-555555555555',
        name: 'Tracked Loop',
        heatmapData: [
          [48.5, 10.5],
          [48.51, 10.51],
        ],
      }),
      mockTour({
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Trackless Loop',
        createdAt: '2026-07-02T00:00:00.000Z',
      }),
    ],
  },
});

staticTest(
  'narrows the list to tours with an on-screen track, and restores it when toggled off',
  async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).list.locators.names).toHaveText(['Trackless Loop', 'Tracked Loop']);

    await expect(on(page).list.locators.filterInView.toggle).toBeVisible();
    await on(page).list.do.showOnlyToursInView();
    await expect(on(page).list.locators.names).toHaveText(['Tracked Loop']);

    await on(page).list.do.showToursOutOfView();
    await expect(on(page).list.locators.names).toHaveText(['Trackless Loop', 'Tracked Loop']);
  },
);
