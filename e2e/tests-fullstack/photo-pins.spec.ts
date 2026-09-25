import { expect, fullstackTest } from './fullstack-test';
import { PHOTOS, type Seeder } from './seed';

fullstackTest.describe('photo pins', () => {
  fullstackTest.beforeEach(async ({ seed }) => {
    const tourId = await seed.tour({
      name: 'Geotagged Tour',
      time: '2026-06-01T08:00:00Z',
      points: [
        [48.1, 11.5],
        [48.2, 11.6],
      ],
    });
    // Identical coordinates: both must fan out, not stack into one.
    await seed.photo({ tourId, path: PHOTOS.at48_1_11_5 });
    await seed.photo({ tourId, path: PHOTOS.at48_1_11_5 });
  });

  fullstackTest(
    'toggle off by default; reveals both co-located pins fanned out',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      await expect(on(page).list.locators.names).toHaveText(['Geotagged Tour']);

      // Visible but off.
      await expect(on(page).map.locators.pins.toggle).toBeVisible();
      await expect(on(page).map.locators.pins.toggleInput).not.toBeChecked();
      await expect(on(page).map.locators.pins.markers).toHaveCount(0);

      await on(page).map.do.showPins();
      await expect(on(page).map.locators.pins.markers).toHaveCount(2);

      // Below the region-level cutoff pins hide rather than crowd unrelated places together.
      await on(page).map.do.zoomOut(15);
      await expect(on(page).map.locators.pins.markers).toHaveCount(0);

      // Back in past the cutoff: zoomend re-runs the grouping.
      await on(page).map.do.zoomIn(15);
      await expect(on(page).map.locators.pins.markers).toHaveCount(2);

      await on(page).map.do.hidePins();
      await expect(on(page).map.locators.pins.markers).toHaveCount(0);
    },
  );
});

async function seedToursAAndB(seed: Seeder) {
  const tourA = await seed.tour({
    name: 'Tour A',
    time: '2026-06-03T08:00:00Z',
    points: [
      [48.1, 11.5],
      [48.11, 11.51],
    ],
  });
  await seed.photo({ tourId: tourA, path: PHOTOS.at48_1_11_5 });
  const tourB = await seed.tour({
    name: 'Tour B',
    time: '2026-06-02T08:00:00Z',
    points: [
      [48.12, 11.55],
      [48.13, 11.56],
    ],
  });
  await seed.photo({ tourId: tourB, path: PHOTOS.at48_12_11_55 });
}

fullstackTest.describe('photo pins scoped to selected tour', () => {
  fullstackTest.beforeEach(async ({ seed }) => {
    await seedToursAAndB(seed);
    // No geotagged photos: the toggle must hide for this tour even though others have pins.
    await seed.tour({ name: 'Tour C (no photos)', time: '2026-06-01T08:00:00Z' });
  });

  fullstackTest(
    'shows only the selected tour’s pins, and widens again on close',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      await expect(on(page).list.locators.count).toHaveText('3');

      // Nothing selected yet: both A's and B's pins show.
      await expect(on(page).map.locators.pins.toggle).toBeVisible();
      await on(page).map.do.showPins();
      await expect(on(page).map.locators.pins.markers).toHaveCount(2);

      await on(page).list.row('Tour A').do.click();
      await expect(on(page).detail.locators.name).toHaveText('Tour A');
      await expect(on(page).map.locators.pins.markers).toHaveCount(1);

      await on(page).list.row('Tour B').do.click();
      await expect(on(page).detail.locators.name).toHaveText('Tour B');
      await expect(on(page).map.locators.pins.markers).toHaveCount(1);

      await on(page).list.row('Tour C (no photos)').do.click();
      await expect(on(page).detail.locators.name).toHaveText('Tour C (no photos)');
      await expect(on(page).map.locators.pins.toggle).toBeHidden();

      // Closing drops the selection, so pins widen straight back to every tour's.
      await on(page).list.row('Tour A').do.click();
      await on(page).detail.do.close();
      await expect(on(page).map.locators.pins.toggle).toBeVisible();
      await expect(on(page).map.locators.pins.markers).toHaveCount(2);
    },
  );
});

// Pins are the observable proxy for which tour a tap selected.
fullstackTest.describe('a tap scopes pins to just that tour', () => {
  fullstackTest.use({ hasTouch: true });

  fullstackTest.beforeEach(async ({ seed }) => {
    await seedToursAAndB(seed);
  });

  fullstackTest('tapping a row scopes pins to just that tour', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).list.locators.count).toHaveText('2');

    // Nothing tapped yet: both A's and B's pins show.
    await expect(on(page).map.locators.pins.toggle).toBeVisible();
    await on(page).map.do.showPins();
    await expect(on(page).map.locators.pins.markers).toHaveCount(2);

    // A tap, like a click, opens the detail panel directly.
    await on(page).list.row('Tour A').do.tap();
    await expect(on(page).detail.locators.name).toHaveText('Tour A');
    await expect(on(page).list.row('Tour A').locators.content).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(on(page).map.locators.pins.markers).toHaveCount(1);
  });
});
