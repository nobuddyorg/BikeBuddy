import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// The phone layout opens on the list, its map hidden: the map data and the basemap wait for
// the map (#580).

staticTest.use({
  viewport: { width: 390, height: 844 },
  mockAccount: {
    tours: [
      mockTour({
        id: '88888888-8888-4888-8888-888888888888',
        name: 'Phone Tour',
        heatmapData: [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
      }),
    ],
  },
});

staticTest('loads the map data only once the phone map is opened', async ({ on, page }) => {
  const mapRequests: string[] = [];
  await page.route('**/api/v1/map', async (route) => {
    mapRequests.push(route.request().url());
    await route.fallback();
  });

  await page.goto('/');
  await expect(on(page).list.locators.names).toHaveText(['Phone Tour']);
  expect(mapRequests).toEqual([]);

  await on(page).main.do.openMobileMap();

  await expect(on(page).map()).toHaveAttribute('data-route-lines', '1');
  expect(mapRequests).toHaveLength(1);
});

staticTest('loads the basemap only once the phone map is opened', async ({ on, page }) => {
  const mapLibreRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/vendor/maplibre-gl/')) mapLibreRequests.push(request.url());
  });

  await page.goto('/');
  await expect(on(page).list.locators.names).toHaveText(['Phone Tour']);
  // A shown map starts MapLibre one frame after start-up; three frames leave no doubt.
  for (let frame = 0; frame < 3; frame++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }
  expect(mapLibreRequests).toEqual([]);

  await on(page).main.do.openMobileMap();

  await expect.poll(() => mapLibreRequests.length).toBeGreaterThan(0);
});
