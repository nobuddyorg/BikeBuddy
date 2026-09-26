import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

const ALPINE_LOOP_ID = '11111111-1111-4111-8111-111111111111';

staticTest.use({
  mockAccount: {
    tours: [
      mockTour({
        id: ALPINE_LOOP_ID,
        name: 'Alpine Loop',
        createdAt: '2026-07-02T00:00:00.000Z',
        heatmapData: [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
      }),
      mockTour({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Coastal Run',
        distance: 7,
        heatmapData: [
          [48.3, 11.8],
          [48.4, 11.9],
        ],
      }),
    ],
  },
});

staticTest.describe('URL state', () => {
  staticTest('loading a tour URL directly opens that tour', async ({ on, page }) => {
    await page.goto(`/#/tour/${ALPINE_LOOP_ID}`);
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await expect(on(page).detail()).toBeVisible();
    await expect(on(page).detail.locators.name).toHaveText('Alpine Loop');
    await on(page).a11y.check('tour list and detail panel');
  });

  staticTest('an unknown tour id degrades to the full-map view', async ({ on, page }) => {
    await page.goto('/#/tour/does-not-exist');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await expect(on(page).detail()).toBeHidden();
    await expect(on(page).list.locators.current).toHaveCount(0);
    // The dead id must not linger in the address bar once the tours have loaded.
    await expect(page).not.toHaveURL(/\/tour\//);
  });

  staticTest(
    'selecting a tour changes the URL, and Back closes the panel',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).list.row('Alpine Loop').do.click();
      await expect(on(page).detail()).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/tour/${ALPINE_LOOP_ID}`));

      await page.goBack();

      await expect(on(page).detail()).toBeHidden();
    },
  );

  staticTest('Back closes an open modal instead of leaving the app', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.openHelp();
    await expect(on(page).modal.help()).toBeVisible();

    await page.goBack();

    await expect(on(page).modal.help()).toBeHidden();
    // Still on the app, not navigated away.
    await expect(on(page).main.locators.userMenu).toBeVisible();
  });

  staticTest('sort, search and "in view" survive a reload', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).list.do.search('Alpine');
    await on(page).list.do.sortBy('name-asc');
    await on(page).list.do.showOnlyToursInView();
    await expect(on(page).list.locators.search).toHaveValue('Alpine');

    await page.reload();
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await expect(on(page).list.locators.search).toHaveValue('Alpine');
    await expect(on(page).list.locators.sort).toHaveValue('name-asc');
    await expect(on(page).list.locators.filterInView.toggleInput).toBeChecked();
  });
});
