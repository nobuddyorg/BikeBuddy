import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

staticTest.use({
  allowedConsoleErrors: { matching: [/status of 503/, /GET \/api\/map answered 503/] },
  mockAccount: {
    tours: [
      mockTour({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Alpine Loop',
        heatmapData: [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
      }),
      mockTour({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Coastal Run',
        heatmapData: [
          [48.3, 11.8],
          [48.4, 11.9],
        ],
      }),
    ],
  },
});

staticTest.describe('when the map data fails to load but the tours do not', () => {
  let mapFailing = true;
  let mapRequests = 0;

  staticTest.beforeEach(async ({ page }) => {
    mapFailing = true;
    mapRequests = 0;
    await page.route('**/api/map', (route) => {
      mapRequests++;
      return mapFailing
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        : route.fallback();
    });
    await page.goto('/');
  });

  staticTest('says the map failed, not that there are no tours', async ({ on, page }) => {
    await expect(on(page).map.locators.loadError).toBeVisible();
    await expect(on(page).map.locators.empty).toBeHidden();
    await expect(on(page).list.row('Alpine Loop')()).toBeVisible();
  });

  staticTest(
    'asks again on the next redraw instead of caching the failure',
    async ({ on, page }) => {
      await expect(on(page).map.locators.loadError).toBeVisible();
      const failedRequests = mapRequests;
      mapFailing = false;

      await on(page).list.row('Alpine Loop').do.click();
      await expect(on(page).detail.locators.name).toHaveText('Alpine Loop');
      await on(page).detail.do.close();

      await expect(on(page).map.locators.loadError).toBeHidden();
      await expect(on(page).map.locators.empty).toBeHidden();
      expect(mapRequests).toBeGreaterThan(failedRequests);
    },
  );

  staticTest('recovers through the retry button', async ({ on, page }) => {
    await expect(on(page).map.locators.loadError).toBeVisible();
    mapFailing = false;

    await on(page).map.do.retryLoad();

    await expect(on(page).map.locators.loadError).toBeHidden();
    await expect(on(page).map.locators.empty).toBeHidden();
  });
});
