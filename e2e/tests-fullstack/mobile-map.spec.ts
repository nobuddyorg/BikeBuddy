import { expect, fullstackTest } from './fullstack-test';

fullstackTest.describe('mobile map access', () => {
  fullstackTest.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  fullstackTest.beforeEach(async ({ seed }) => {
    await seed.tour({ name: 'Mobile Map Tour A', time: '2026-06-02T08:00:00Z' });
    await seed.tour({ name: 'Mobile Map Tour B', time: '2026-06-01T08:00:00Z' });
  });

  fullstackTest('the map is off-screen on the list home screen', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await expect(on(page).main.locators.sidebar).toBeVisible();
    await expect(on(page).map()).toBeHidden();
    await expect(on(page).main.locators.buttons.mobileMapFab).toBeVisible();
    // A phone never keeps the map on one tour behind the list, so there is nothing to reset.
    await expect(on(page).list.locators.buttons.showAll).toBeHidden();
  });

  fullstackTest(
    "closing a tour's detail panel returns to the list with nothing selected",
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).list.row('Mobile Map Tour A').do.tap();
      await expect(on(page).detail.locators.name).toHaveText('Mobile Map Tour A');

      await on(page).detail.do.close();

      await expect(on(page).detail()).toBeHidden();
      await expect(on(page).list.locators.current).toHaveCount(0);
    },
  );

  fullstackTest('the FAB opens the map full-screen over all tours', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.openMobileMap();

    await expect(on(page).map()).toBeVisible();
    await expect(on(page).main.locators.sidebar).toBeHidden();
    await on(page).a11y.check('mobile map full-screen');

    // Closing (the same expand/restore toggle) returns to the list.
    await on(page).main.do.toggleSidebar();
    await expect(on(page).main.locators.sidebar).toBeVisible();
    await expect(on(page).map()).toBeHidden();
  });

  fullstackTest(
    'the FAB opens the map over only the checked tours in select mode',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).list.row('Mobile Map Tour A').do.longPress();
      await expect(on(page).list.locators.selection.count).toHaveText('1 selected');

      await on(page).main.do.openMobileMap();
      await expect(on(page).map()).toBeVisible();
    },
  );

  fullstackTest(
    'the detail panel shows a live map preview with a working fullscreen button',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).list.row('Mobile Map Tour A').do.tap();
      await expect(on(page).detail.locators.name).toHaveText('Mobile Map Tour A');
      await expect(on(page).map()).toBeVisible();

      // Expand from the preview goes full-screen, hiding the detail panel...
      await on(page).main.do.toggleSidebar();
      await expect(on(page).map()).toBeVisible();
      await expect(on(page).detail()).toBeHidden();

      // ...and collapsing it returns the map to the still-open detail panel.
      await on(page).main.do.toggleSidebar();
      await expect(on(page).detail()).toBeVisible();
      await expect(on(page).map()).toBeVisible();
    },
  );
});
