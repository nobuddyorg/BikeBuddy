import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// The empty-map overlay is the proxy for the map showing exactly the checked tours.
// Static, not full stack: the API refuses a GPX without a track, so only a tour stored before that has none.

staticTest.describe('selecting tours drives the map', () => {
  staticTest.use({
    mockAccount: {
      tours: [
        mockTour({
          id: '77777777-7777-4777-8777-777777777777',
          name: 'MapSelect Tour With Data',
          createdAt: '2026-06-02T08:00:00.000Z',
          heatmapData: [
            [48.1, 11.5],
            [48.11, 11.51],
          ],
        }),
        mockTour({
          id: '88888888-8888-4888-8888-888888888888',
          name: 'MapSelect Tour No Data',
          createdAt: '2026-06-01T08:00:00.000Z',
        }),
      ],
    },
  });

  staticTest('map reflects exactly the checked tours', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).list.locators.count).toHaveText('2');

    // Nothing selected yet: the data tour's points count.
    await expect(on(page).map.locators.empty).toBeHidden();

    await on(page).list.do.enterSelectMode();
    await expect(on(page).list.locators.selection.count).toHaveText('0 selected');

    await on(page).list.row('MapSelect Tour No Data').do.click();
    await expect(on(page).list.locators.selection.count).toHaveText('1 selected');
    await expect(on(page).map.locators.empty).toBeVisible();

    await on(page).list.row('MapSelect Tour With Data').do.click();
    await expect(on(page).list.locators.selection.count).toHaveText('2 selected');
    await expect(on(page).map.locators.empty).toBeHidden();

    // Empty again, so the map is updating on every toggle, not just the first.
    await on(page).list.row('MapSelect Tour With Data').do.click();
    await expect(on(page).list.locators.selection.count).toHaveText('1 selected');
    await expect(on(page).map.locators.empty).toBeVisible();

    // Nothing checked in select mode: the map falls back to all tours.
    await on(page).list.row('MapSelect Tour No Data').do.click();
    await expect(on(page).list.locators.selection.count).toHaveText('0 selected');
    await expect(on(page).list.locators.selection.bar).toBeVisible();
    await expect(on(page).map.locators.empty).toBeHidden();

    // Re-checked, so the cancel below tests the exit path, not the fallback again.
    await on(page).list.row('MapSelect Tour No Data').do.click();
    await expect(on(page).map.locators.empty).toBeVisible();

    await on(page).list.do.cancelSelect();
    await expect(on(page).list.locators.selection.bar).toBeHidden();
    await expect(on(page).map.locators.empty).toBeHidden();
  });

  staticTest('a selection made while the map loads waits for that load', async ({ on, page }) => {
    const mapRequests: string[] = [];
    let releaseMap = () => {};
    const mapHeld = new Promise<void>((resolve) => (releaseMap = resolve));
    await page.route('**/api/map', async (route) => {
      mapRequests.push(route.request().url());
      await mapHeld;
      await route.fallback();
    });

    await page.goto('/');
    await expect(on(page).list.locators.count).toHaveText('2');
    await on(page).list.do.enterSelectMode();
    await on(page).list.row('MapSelect Tour With Data').do.click();
    await expect(on(page).list.locators.selection.count).toHaveText('1 selected');
    releaseMap();

    await expect(on(page).map.locators.empty).toBeHidden();
    expect(mapRequests).toHaveLength(1);
  });
});
