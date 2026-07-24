import { buddyTest, expect } from '../pages/buddy-test';

// #315: a toggle in the sidebar narrows the tour list to only tours whose
// track is (even partially) on screen. On load the map auto-fits to *all*
// loaded tours (renderAllHeatmap), so a tour with a real track is reliably in
// view right away. A tour with no recorded track (e.g. GPX import produced no
// points) never contributes to that fit and is never "in view" either,
// regardless of where the map is looking — this is the scenario the test
// drives, since it only depends on the one fitBounds call already covered by
// the passing photo-pins-mobile spec, rather than a second, later fit.

const TRACKED_ID = '55555555-5555-4555-8555-555555555555';
const TRACKLESS_ID = '66666666-6666-4666-8666-666666666666';

const trackedTour = {
  id: TRACKED_ID,
  userId: 'local-dev-user',
  name: 'Tracked Loop',
  description: '',
  distance: 5,
  createdAt: '2026-07-01T00:00:00.000Z',
  heatmapData: [
    [48.5, 10.5],
    [48.51, 10.51],
  ],
  images: [],
};

const tracklessTour = {
  id: TRACKLESS_ID,
  userId: 'local-dev-user',
  name: 'Trackless Loop',
  description: '',
  distance: 5,
  createdAt: '2026-07-02T00:00:00.000Z',
  heatmapData: [],
  images: [],
};

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const listItem = (t: typeof trackedTour) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  distance: t.distance,
  createdAt: t.createdAt,
});

buddyTest.describe('filter tours in view (#315)', () => {
  buddyTest.beforeEach(async ({ page }) => {
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
    await page.route(`**/api/tours/${TRACKED_ID}`, (route) => route.fulfill(json(trackedTour)));
    await page.route(`**/api/tours/${TRACKLESS_ID}`, (route) => route.fulfill(json(tracklessTour)));
    await page.route('**/api/tours', (route) =>
      route.fulfill(json([listItem(trackedTour), listItem(tracklessTour)])),
    );
  });

  buddyTest(
    'narrows the list to tours with an on-screen track, and restores it when toggled off',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.list.container).toContainText('Tracked Loop');
      await expect(on(page).main.locators.list.container).toContainText('Trackless Loop');

      await expect(on(page).main.locators.filterInView.toggle).toBeVisible();
      await on(page).main.do.filterInView(true);

      await expect(on(page).main.locators.list.container).toContainText('Tracked Loop');
      await expect(on(page).main.locators.list.container).not.toContainText('Trackless Loop');

      await on(page).main.do.filterInView(false);
      await expect(on(page).main.locators.list.container).toContainText('Trackless Loop');
    },
  );
});
