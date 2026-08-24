import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// Photo pins. Seeded directly rather than uploaded: a SAS url is signed
// even when the blob behind it doesn't exist.

const TID = '22222222-2222-4222-8222-222222222222';
const IID = '33333333-3333-4333-8333-333333333333';
const IID2 = '44444444-4444-4444-8444-444444444444';

buddyTest.describe('photo pins', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    await toursContainer().items.create({
      id: TID,
      userId: 'local-dev-user',
      name: 'Geotagged Tour',
      distance: 5,
      createdAt: new Date().toISOString(),
      heatmapData: [
        [48.1, 11.5],
        [48.2, 11.6],
      ],
      // Identical coordinates: both must fan out, not stack into one.
      images: [
        { id: IID, blobName: `local-dev-user/${TID}/${IID}.jpg`, lat: 48.1, lon: 11.5 },
        { id: IID2, blobName: `local-dev-user/${TID}/${IID2}.jpg`, lat: 48.1, lon: 11.5 },
      ],
    });
  });

  buddyTest(
    'toggle off by default; reveals both co-located pins fanned out',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      await expect(on(page).main.locators.list.container).toContainText('Geotagged Tour');

      // Visible but off.
      await expect(on(page).main.locators.pins.toggle).toBeVisible();
      await expect(on(page).main.locators.pins.toggleInput).not.toBeChecked();
      await expect(on(page).main.locators.pins.markers).toHaveCount(0);

      await on(page).main.do.showPins(true);
      await expect(on(page).main.locators.pins.markers).toHaveCount(2);

      // Past the region-level cutoff pins hide entirely, rather than
      // clutter a country-level view with photos from unrelated places.
      await on(page).main.do.zoomOut(15);
      await expect(on(page).main.locators.pins.markers).toHaveCount(0);

      // Back in past the cutoff: zoomend re-runs the grouping.
      await on(page).main.do.zoomIn(15);
      await expect(on(page).main.locators.pins.markers).toHaveCount(2);

      await on(page).main.do.showPins(false);
      await expect(on(page).main.locators.pins.markers).toHaveCount(0);
    },
  );
});

// #274: a tour's markers must never leak in photos from other tours, and the
// toggle must follow the current scope rather than the whole library.
const TID_A = '55555555-5555-4555-8555-555555555555';
const IID_A = '66666666-6666-4666-8666-666666666666';
const TID_B = '77777777-7777-4777-8777-777777777777';
const IID_B = '88888888-8888-4888-8888-888888888888';
const TID_C = '99999999-9999-4999-8999-999999999999';

buddyTest.describe('photo pins scoped to selected tour', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    await toursContainer().items.create({
      id: TID_A,
      userId: 'local-dev-user',
      name: 'Tour A',
      distance: 5,
      createdAt: new Date().toISOString(),
      heatmapData: [
        [48.1, 11.5],
        [48.11, 11.51],
      ],
      images: [
        { id: IID_A, blobName: `local-dev-user/${TID_A}/${IID_A}.jpg`, lat: 48.1, lon: 11.5 },
      ],
    });
    await toursContainer().items.create({
      id: TID_B,
      userId: 'local-dev-user',
      name: 'Tour B',
      distance: 5,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      heatmapData: [
        [48.12, 11.55],
        [48.13, 11.56],
      ],
      images: [
        { id: IID_B, blobName: `local-dev-user/${TID_B}/${IID_B}.jpg`, lat: 48.12, lon: 11.55 },
      ],
    });
    // No geotagged photos: the toggle must hide for this tour even though
    // others have pins.
    await toursContainer().items.create({
      id: TID_C,
      userId: 'local-dev-user',
      name: 'Tour C (no photos)',
      distance: 5,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    });
  });

  buddyTest(
    'shows only the selected tour’s pins, and widens again on close',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      await expect(on(page).main.locators.list.count).toHaveText('3');

      // Nothing selected yet: both A's and B's pins show.
      await expect(on(page).main.locators.pins.toggle).toBeVisible();
      await on(page).main.do.showPins(true);
      await expect(on(page).main.locators.pins.markers).toHaveCount(2);

      await on(page).main.do.selectTour('Tour A');
      await expect(on(page).main.locators.detail.name).toHaveText('Tour A');
      await expect(on(page).main.locators.pins.markers).toHaveCount(1);

      await on(page).main.do.selectTour('Tour B');
      await expect(on(page).main.locators.detail.name).toHaveText('Tour B');
      await expect(on(page).main.locators.pins.markers).toHaveCount(1);

      // Tour C has no geotagged photos at all, so the toggle hides rather than
      // showing zero markers.
      await on(page).main.do.selectTour('Tour C (no photos)');
      await expect(on(page).main.locators.detail.name).toHaveText('Tour C (no photos)');
      await expect(on(page).main.locators.pins.toggle).toBeHidden();

      // Closing the panel drops the selection and widens pins straight back
      // to every tour's — there's nothing left for "Show All Tours" to widen
      // from after a close.
      await on(page).main.do.selectTour('Tour A');
      await on(page).main.do.closeDetail();
      await expect(on(page).main.locators.pins.toggle).toBeVisible();
      await expect(on(page).main.locators.pins.markers).toHaveCount(2);
    },
  );
});

// #331: a tap must focus the map, not just highlight the row (tap now opens
// the detail panel directly, same as a click — see long-press-select.spec.ts).
// Pins are the observable proxy — the scoping reads state.selectedTourId.
buddyTest.describe('a tap scopes pins to just that tour', () => {
  buddyTest.use({ hasTouch: true });

  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    await toursContainer().items.create({
      id: TID_A,
      userId: 'local-dev-user',
      name: 'Tour A',
      distance: 5,
      createdAt: new Date().toISOString(),
      heatmapData: [
        [48.1, 11.5],
        [48.11, 11.51],
      ],
      images: [
        { id: IID_A, blobName: `local-dev-user/${TID_A}/${IID_A}.jpg`, lat: 48.1, lon: 11.5 },
      ],
    });
    await toursContainer().items.create({
      id: TID_B,
      userId: 'local-dev-user',
      name: 'Tour B',
      distance: 5,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      heatmapData: [
        [48.12, 11.55],
        [48.13, 11.56],
      ],
      images: [
        { id: IID_B, blobName: `local-dev-user/${TID_B}/${IID_B}.jpg`, lat: 48.12, lon: 11.55 },
      ],
    });
  });

  buddyTest('tapping a row scopes pins to just that tour', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.count).toHaveText('2');

    // Nothing tapped yet: both A's and B's pins show.
    await expect(on(page).main.locators.pins.toggle).toBeVisible();
    await on(page).main.do.showPins(true);
    await expect(on(page).main.locators.pins.markers).toHaveCount(2);

    // A tap, like a click, opens the detail panel directly.
    await on(page).main.do.tapTour('Tour A');
    await expect(on(page).main.locators.detail.name).toHaveText('Tour A');
    await expect(
      on(page).main.locators.list.container.locator('.tour-item.active', { hasText: 'Tour A' }),
    ).toBeVisible();
    await expect(on(page).main.locators.pins.markers).toHaveCount(1);
  });
});
