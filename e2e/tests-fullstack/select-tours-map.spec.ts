import { randomUUID } from 'node:crypto';
import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #298: the map must show exactly the checked set. #map-empty is the simplest
// proxy for that — one tour has route data and the other doesn't, and toggling
// between them flips it only when the scoping is right.

const TID_WITH_DATA = randomUUID();
const TID_NO_DATA = randomUUID();

buddyTest.describe('selecting tours drives the map', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    await toursContainer().items.create({
      id: TID_WITH_DATA,
      userId: 'local-dev-user',
      name: 'MapSelect Tour With Data',
      distance: 5,
      createdAt: new Date().toISOString(),
      heatmapData: [
        [48.1, 11.5],
        [48.11, 11.51],
      ],
    });
    await toursContainer().items.create({
      id: TID_NO_DATA,
      userId: 'local-dev-user',
      name: 'MapSelect Tour No Data',
      distance: 5,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
  });

  buddyTest('map reflects exactly the checked tours', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.count).toHaveText('2');

    // Nothing selected yet: the data tour's points count.
    await expect(on(page).main.locators.mapEmpty).toBeHidden();

    await on(page).main.do.enterSelectMode();
    await expect(on(page).main.locators.selection.count).toHaveText('0 selected');

    await on(page).main.do.toggleTourSelection('MapSelect Tour No Data');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');
    await expect(on(page).main.locators.mapEmpty).toBeVisible();

    await on(page).main.do.toggleTourSelection('MapSelect Tour With Data');
    await expect(on(page).main.locators.selection.count).toHaveText('2 selected');
    await expect(on(page).main.locators.mapEmpty).toBeHidden();

    // Empty again, so the map is updating on every toggle, not just the first.
    await on(page).main.do.toggleTourSelection('MapSelect Tour With Data');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');
    await expect(on(page).main.locators.mapEmpty).toBeVisible();

    // Nothing checked, still in select mode: the map falls back to all tours
    // rather than staying empty.
    await on(page).main.do.toggleTourSelection('MapSelect Tour No Data');
    await expect(on(page).main.locators.selection.count).toHaveText('0 selected');
    await expect(on(page).main.locators.selection.bar).toBeVisible();
    await expect(on(page).main.locators.mapEmpty).toBeHidden();

    // Re-checked, so the cancel below tests the exit path rather than the
    // empty-selection fallback again.
    await on(page).main.do.toggleTourSelection('MapSelect Tour No Data');
    await expect(on(page).main.locators.mapEmpty).toBeVisible();

    await on(page).main.do.cancelSelect();
    await expect(on(page).main.locators.selection.bar).toBeHidden();
    await expect(on(page).main.locators.mapEmpty).toBeHidden();
  });
});
