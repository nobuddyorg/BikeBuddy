import { buddyTest, expect } from '../pages/buddy-test';

// #443: the app never touched the URL or history, so a tour couldn't be
// linked/bookmarked, a reload dropped sort/search/"in view", and the mobile
// Back gesture left the app instead of closing whatever panel was open.

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
  images: [],
};

const tourB = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: 'local-dev-user',
  name: 'Coastal Run',
  description: '',
  distance: 7,
  createdAt: '2026-07-01T00:00:00.000Z',
  heatmapData: [
    [48.3, 11.8],
    [48.4, 11.9],
  ],
  images: [],
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

buddyTest.describe('URL state', () => {
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
    await page.route('**/api/map', (route) =>
      route.fulfill(json([mapEntry(tourA), mapEntry(tourB)])),
    );
    await page.route(`**/api/tours/${tourA.id}`, (route) => route.fulfill(json(tourA)));
    await page.route(`**/api/tours/${tourB.id}`, (route) => route.fulfill(json(tourB)));
    await page.route('**/api/tours', (route) =>
      route.fulfill(json([listItem(tourA), listItem(tourB)])),
    );
  });

  buddyTest('loading a tour URL directly opens that tour', async ({ on, page }) => {
    await page.goto(`/#/tour/${tourA.id}`);
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await expect(on(page).main.locators.detail.panel).toBeVisible();
    await expect(on(page).main.locators.detail.name).toHaveText('Alpine Loop');
  });

  buddyTest('an unknown tour id degrades to the full-map view', async ({ on, page }) => {
    await page.goto('/#/tour/does-not-exist');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await expect(on(page).main.locators.detail.panel).toBeHidden();
    await expect(on(page).main.locators.list.active).toHaveCount(0);
    // The dead id shouldn't linger in the address bar once it's known to be
    // bad - polled, since page.url() is a plain synchronous snapshot and the
    // cleanup only runs once loadTours() finishes resolving the deep link.
    await expect.poll(() => page.url()).not.toContain('/tour/');
  });

  buddyTest('selecting a tour changes the URL, and Back closes the panel', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.selectTour('Alpine Loop');
    await expect(on(page).main.locators.detail.panel).toBeVisible();
    expect(page.url()).toContain(`/tour/${tourA.id}`);

    await page.goBack();

    await expect(on(page).main.locators.detail.panel).toBeHidden();
  });

  buddyTest('Back closes an open modal instead of leaving the app', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.openHelp();
    await expect(on(page).modal.help()).toBeVisible();

    await page.goBack();

    await expect(on(page).modal.help()).toBeHidden();
    // Still on the app, not navigated away.
    await expect(on(page).main.locators.userMenu).toBeVisible();
  });

  buddyTest('sort, search and "in view" survive a reload', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.search('Alpine');
    await on(page).main.do.sortBy('name-asc');
    await on(page).main.do.filterInView(true);
    await expect(on(page).main.locators.search).toHaveValue('Alpine');

    await page.reload();
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await expect(on(page).main.locators.search).toHaveValue('Alpine');
    await expect(on(page).main.locators.sort).toHaveValue('name-asc');
    await expect(on(page).main.locators.filterInView.toggleInput).toBeChecked();
  });
});
