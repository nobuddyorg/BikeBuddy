import { expect, fullstackTest } from './fullstack-test';

// #298: the map must show exactly the checked set. #map-empty is the simplest
// proxy for that — one tour has route data and the other doesn't, and toggling
// between them flips it only when the scoping is right.

fullstackTest.describe('selecting tours drives the map', () => {
  fullstackTest.beforeEach(async ({ seed }) => {
    await seed.tour({
      name: 'MapSelect Tour With Data',
      time: '2026-06-02T08:00:00Z',
      points: [
        [48.1, 11.5],
        [48.11, 11.51],
      ],
    });
    // A GPX without track points: a tour with nothing to draw.
    await seed.tour({ name: 'MapSelect Tour No Data', time: '2026-06-01T08:00:00Z' });
  });

  fullstackTest('map reflects exactly the checked tours', async ({ on, page }) => {
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

    // Nothing checked, still in select mode: the map falls back to all tours
    // rather than staying empty.
    await on(page).list.row('MapSelect Tour No Data').do.click();
    await expect(on(page).list.locators.selection.count).toHaveText('0 selected');
    await expect(on(page).list.locators.selection.bar).toBeVisible();
    await expect(on(page).map.locators.empty).toBeHidden();

    // Re-checked, so the cancel below tests the exit path rather than the
    // empty-selection fallback again.
    await on(page).list.row('MapSelect Tour No Data').do.click();
    await expect(on(page).map.locators.empty).toBeVisible();

    await on(page).list.do.cancelSelect();
    await expect(on(page).list.locators.selection.bar).toBeHidden();
    await expect(on(page).map.locators.empty).toBeHidden();
  });
});
