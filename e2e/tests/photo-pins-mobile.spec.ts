import { buddyTest, expect } from '../pages/buddy-test';

// Regression guard for #239: the mobile full-screen tour detail must not be the
// only place pins live — the "Photo pins" toggle sits on the map and has to stay
// visible and tappable on the mobile map view. The full-stack photo-pins spec
// only runs at desktop width, so this stubs the API and drives a phone viewport.

const TID = '22222222-2222-4222-8222-222222222222';
// 1x1 transparent PNG — the marker only needs a valid <img> src, not a real blob.
const PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const geotaggedTour = {
  id: TID,
  userId: 'local-dev-user',
  name: 'Geotagged Tour',
  description: '',
  distance: 5,
  createdAt: '2026-07-01T00:00:00.000Z',
  heatmapData: [
    [48.1, 11.5],
    [48.2, 11.6],
  ],
  // Two photos at the same spot → fanned into two markers.
  images: [
    { id: '33333333-3333-4333-8333-333333333333', url: PX, lat: 48.1, lon: 11.5 },
    { id: '44444444-4444-4444-8444-444444444444', url: PX, lat: 48.1, lon: 11.5 },
  ],
};

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

buddyTest.describe('photo pins (mobile)', () => {
  buddyTest.use({ viewport: { width: 390, height: 844 } });

  buddyTest.beforeEach(async ({ page }) => {
    // GET /api/tours omits heatmapData/images (see GetTours); the detail fetch
    // is what brings the geotagged images in.
    const { id, name, description, distance, createdAt } = geotaggedTour;
    const listItem = { id, name, description, distance, createdAt };
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
    await page.route('**/api/tours/*', (route) => route.fulfill(json(geotaggedTour)));
    await page.route('**/api/tours', (route) => route.fulfill(json([listItem])));
  });

  buddyTest('toggle is visible and reveals pins on the mobile map view', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.container).toContainText('Geotagged Tour');

    // The toggle appears once geotagged images are loaded, and must be tappable
    // (not covered) on the phone-width map view.
    await expect(on(page).main.locators.pins.toggle).toBeVisible();
    await on(page).main.do.showPins(true);
    await expect(on(page).main.locators.pins.markers).toHaveCount(2);
  });
});
