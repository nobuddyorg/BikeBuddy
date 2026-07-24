import { randomUUID } from 'node:crypto';
import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #298: checking/unchecking tours in select mode must update the map to
// show exactly the checked set. #map-empty is the only DOM-observable proxy
// for "does the current heatmap have any points" (Leaflet's canvas heat
// layer itself isn't inspectable from Playwright) — one tour has heatmap
// data and the other doesn't, so toggling between them flips #map-empty
// precisely when the map is scoped correctly.

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

    // All tours (nothing selected yet): the data tour has points → not empty.
    await expect(on(page).main.locators.mapEmpty).toBeHidden();

    await on(page).main.do.enterSelectMode();
    await expect(on(page).main.locators.selection.count).toHaveText('0 selected');

    // Check only the no-data tour: the map is scoped to just it → empty.
    await on(page).main.do.toggleTourSelection('MapSelect Tour No Data');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');
    await expect(on(page).main.locators.mapEmpty).toBeVisible();

    // Also check the data tour: combined set has points again → not empty.
    await on(page).main.do.toggleTourSelection('MapSelect Tour With Data');
    await expect(on(page).main.locators.selection.count).toHaveText('2 selected');
    await expect(on(page).main.locators.mapEmpty).toBeHidden();

    // Uncheck the data tour: back to only the no-data tour → empty again,
    // proving the map updates live on every toggle, not just once.
    await on(page).main.do.toggleTourSelection('MapSelect Tour With Data');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');
    await expect(on(page).main.locators.mapEmpty).toBeVisible();

    // Uncheck the last tour too: 0 selected, still in select mode (bar
    // stays up) — the map must fall back to the all-tours view rather than
    // staying empty just because nothing is checked.
    await on(page).main.do.toggleTourSelection('MapSelect Tour No Data');
    await expect(on(page).main.locators.selection.count).toHaveText('0 selected');
    await expect(on(page).main.locators.selection.bar).toBeVisible();
    await expect(on(page).main.locators.mapEmpty).toBeHidden();

    // Re-check the no-data tour so cancelling below also proves the exit
    // path reverts the map, not just the empty-selection fallback.
    await on(page).main.do.toggleTourSelection('MapSelect Tour No Data');
    await expect(on(page).main.locators.mapEmpty).toBeVisible();

    // Cancel select mode: reverts to the all-tours view → not empty.
    await on(page).main.do.cancelSelect();
    await expect(on(page).main.locators.selection.bar).toBeHidden();
    await expect(on(page).main.locators.mapEmpty).toBeHidden();
  });
});
