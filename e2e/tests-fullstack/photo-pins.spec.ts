import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// Photo pins (#100): markers for geotagged images, default hidden, toggled on.
// Seed a tour with a geotagged image directly so GetTour returns lat/lon (no
// real upload needed; the SAS url is signed even if the blob is absent).

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
      // Two photos at the SAME coordinates → both must be shown (fanned), not
      // stacked into one (#126).
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

      // Toggle visible (geotagged images exist) but off → no pins.
      await expect(on(page).main.locators.pins.toggle).toBeVisible();
      await expect(on(page).main.locators.pins.toggleInput).not.toBeChecked();
      await expect(on(page).main.locators.pins.markers).toHaveCount(0);

      // Turn on → both co-located pins appear (fanned, each clickable).
      await on(page).main.do.showPins(true);
      await expect(on(page).main.locators.pins.markers).toHaveCount(2);

      // Zoom out past the map's minimum (region-level cutoff, #236): pins
      // hide entirely rather than clutter a world/country-level view with
      // fanned-out photos from possibly unrelated locations.
      await on(page).main.do.zoomOut(15);
      await expect(on(page).main.locators.pins.markers).toHaveCount(0);

      // Zoom back in past the cutoff (#210): the zoomend listener re-runs
      // grouping/fan-out and both markers reappear.
      await on(page).main.do.zoomIn(15);
      await expect(on(page).main.locators.pins.markers).toHaveCount(2);

      // Turn off → pins removed.
      await on(page).main.do.showPins(false);
      await expect(on(page).main.locators.pins.markers).toHaveCount(0);
    },
  );
});

// #274: pins must be scoped to the selected tour — a single tour's markers
// should never leak photos from other tours, and the toggle should only be
// available when the current scope (selected tour, or all tours) actually
// has a geotagged photo.
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
    // No geotagged photos at all — proves the toggle hides for this tour
    // even though other tours have pins.
    await toursContainer().items.create({
      id: TID_C,
      userId: 'local-dev-user',
      name: 'Tour C (no photos)',
      distance: 5,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    });
  });

  buddyTest(
    'shows only the selected tour’s pins, and widens again on Show All',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      await expect(on(page).main.locators.list.count).toHaveText('3');

      // All tours (nothing selected yet): both A's and B's pins show.
      await expect(on(page).main.locators.pins.toggle).toBeVisible();
      await on(page).main.do.showPins(true);
      await expect(on(page).main.locators.pins.markers).toHaveCount(2);

      // Select Tour A: only its own pin shows, not Tour B's.
      await on(page).main.do.selectTour('Tour A');
      await expect(on(page).main.locators.detail.name).toHaveText('Tour A');
      await expect(on(page).main.locators.pins.markers).toHaveCount(1);

      // Select Tour B: only its own pin shows.
      await on(page).main.do.selectTour('Tour B');
      await expect(on(page).main.locators.detail.name).toHaveText('Tour B');
      await expect(on(page).main.locators.pins.markers).toHaveCount(1);

      // Select Tour C (no geotagged photos): the toggle itself hides, since
      // this tour has no pins to show at all — not just zero markers.
      await on(page).main.do.selectTour('Tour C (no photos)');
      await expect(on(page).main.locators.detail.name).toHaveText('Tour C (no photos)');
      await expect(on(page).main.locators.pins.toggle).toBeHidden();

      // Closing the panel leaves the tour selected, so its pins stay scoped to
      // it; "Show All Tours" is what goes back to every tour's (#378).
      await on(page).main.do.selectTour('Tour A');
      await on(page).main.do.closeDetail();
      await expect(on(page).main.locators.pins.toggle).toBeVisible();
      await expect(on(page).main.locators.pins.markers).toHaveCount(1);

      await on(page).main.do.showAllTours();
      await expect(on(page).main.locators.pins.markers).toHaveCount(2);
    },
  );
});

// #331: a mobile tap must focus the map on the tapped tour the same way a
// desktop click / swipe-left does — not just highlight the row. Pins are the
// easiest observable proxy for "did the map actually focus": geotaggedImages()
// scopes to state.selectedTourId, but before the fix that scoping never
// re-rendered on a plain tap, so both tours' pins stayed visible.
buddyTest.describe('mobile tap focuses the map, not just the row (#331)', () => {
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

    // All tours (nothing tapped yet): both A's and B's pins show.
    await expect(on(page).main.locators.pins.toggle).toBeVisible();
    await on(page).main.do.showPins(true);
    await expect(on(page).main.locators.pins.markers).toHaveCount(2);

    // Tap Tour A (not a click — the detail panel must stay closed, #310):
    // only its own pin should remain.
    await on(page).main.do.tapTour('Tour A');
    await expect(on(page).main.locators.detail.panel).toBeHidden();
    await expect(
      on(page).main.locators.list.container.locator('.tour-item.active', { hasText: 'Tour A' }),
    ).toBeVisible();
    await expect(on(page).main.locators.pins.markers).toHaveCount(1);
  });
});
