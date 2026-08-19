import { buddyTest, expect } from '../pages/buddy-test';

// #378: closing the detail panel must not drop the selection. The map is always
// showing either one tour with its own photos, or every tour with all of them.
// Before the fix, closing the panel cleared state.selectedTourId while leaving
// the single tour's route on the map — so the pins widened to every tour's
// photos while the track stayed scoped to one, and no row was active.

// 1x1 transparent PNG — the marker only needs a valid <img> src, not a real blob.
const PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const tourA = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'local-dev-user',
  name: 'Alpine Loop',
  description: '',
  distance: 5,
  createdAt: '2026-07-02T00:00:00.000Z',
  heatmapData: [
    [48.1, 11.5],
    [48.2, 11.6],
  ],
  images: [{ id: '33333333-3333-4333-8333-333333333333', url: PX, lat: 48.1, lon: 11.5 }],
};

const tourB = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: 'local-dev-user',
  name: 'Coastal Run',
  description: '',
  distance: 7,
  createdAt: '2026-07-01T00:00:00.000Z',
  // Close to tourA on purpose: the all-tours view fits both, and pins only
  // render at zoom >= PIN_MIN_ZOOM (8), which a continent-wide fit would undo.
  heatmapData: [
    [48.3, 11.8],
    [48.4, 11.9],
  ],
  images: [{ id: '44444444-4444-4444-8444-444444444444', url: PX, lat: 48.3, lon: 11.8 }],
};

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const listItem = ({ id, name, description, distance, createdAt }: typeof tourA) => ({
  id,
  name,
  description,
  distance,
  createdAt,
});
const mapEntry = ({ id, heatmapData, images }: typeof tourA) => ({ id, heatmapData, images });

buddyTest.describe('closing the detail panel', () => {
  buddyTest.beforeEach(async ({ on, page }) => {
    await page.route('**/api/me', (route) =>
      route.fulfill(
        json({
          id: 'local-dev-user',
          name: 'Dev',
          email: 'dev@localhost',
          createdAt: '2026-01-01',
        }),
      ),
    );
    await page.route('**/api/map', (route) =>
      route.fulfill(json([mapEntry(tourA), mapEntry(tourB)])),
    );
    await page.route(`**/api/tours/${tourA.id}`, (route) => route.fulfill(json(tourA)));
    await page.route(`**/api/tours/${tourB.id}`, (route) => route.fulfill(json(tourB)));
    await page.route('**/api/tours', (route) =>
      route.fulfill(json([listItem(tourA), listItem(tourB)])),
    );

    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
  });

  buddyTest('keeps the tour selected, and its pins scoped to it', async ({ on, page }) => {
    await on(page).main.do.showPins(true);
    await expect(on(page).main.locators.pins.markers).toHaveCount(2);

    await on(page).main.do.selectTour('Alpine Loop');
    await expect(on(page).main.locators.detail.name).toHaveText('Alpine Loop');
    await expect(on(page).main.locators.pins.markers).toHaveCount(1);

    await on(page).main.do.closeDetail();

    await expect(on(page).main.locators.detail.panel).toBeHidden();
    await expect(on(page).main.locators.list.active).toHaveCount(1);
    await expect(on(page).main.locators.list.active).toContainText('Alpine Loop');
    await expect(on(page).main.locators.pins.markers).toHaveCount(1);
  });

  // #442: closing the panel must not be a silent filter — the map area itself
  // has to say only one tour is showing, reachable without scrolling the sidebar.
  buddyTest('closing the panel shows a map chip naming the filtered tour', async ({ on, page }) => {
    await on(page).main.do.selectTour('Alpine Loop');
    await expect(on(page).main.locators.mapFilterChip.root).toBeHidden();

    await on(page).main.do.closeDetail();

    await expect(on(page).main.locators.mapFilterChip.root).toBeVisible();
    await expect(on(page).main.locators.mapFilterChip.label).toContainText('Alpine Loop');

    await on(page).main.do.clearMapFilter();

    await expect(on(page).main.locators.mapFilterChip.root).toBeHidden();
    await expect(on(page).main.locators.list.active).toHaveCount(0);
  });

  buddyTest('"Show All Tours" is what returns to the whole map', async ({ on, page }) => {
    await on(page).main.do.showPins(true);
    await on(page).main.do.selectTour('Alpine Loop');
    await on(page).main.do.closeDetail();

    await expect(on(page).main.locators.buttons.showAll).toContainText('Alpine Loop');

    await on(page).main.do.showAllTours();

    await expect(on(page).main.locators.list.active).toHaveCount(0);
    await expect(on(page).main.locators.pins.markers).toHaveCount(2);
    await expect(on(page).main.locators.mapFilterChip.root).toBeHidden();
  });
});
