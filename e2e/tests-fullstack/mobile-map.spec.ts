import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// The mobile redesign moves the map off the list home screen: a FAB opens it
// full-screen (all tours, or just the checked ones in select mode), and the
// detail panel gets a small live preview of just that tour, reparenting the
// single shared Leaflet instance (ui/map.js's moveMapIntoDetailPanel /
// restoreMapToAppLayout) rather than a second map.

buddyTest.describe('mobile map access', () => {
  buddyTest.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    await toursContainer().items.create({
      id: '77777777-7777-4777-8777-777777777777',
      userId: 'local-dev-user',
      name: 'Mobile Map Tour A',
      distance: 5,
      createdAt: new Date(now).toISOString(),
    });
    await toursContainer().items.create({
      id: '88888888-8888-4888-8888-888888888888',
      userId: 'local-dev-user',
      name: 'Mobile Map Tour B',
      distance: 5,
      createdAt: new Date(now - 60_000).toISOString(),
    });
  });

  buddyTest('the map is off-screen on the list home screen', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await expect(on(page).main.locators.sidebar).toBeVisible();
    await expect(on(page).main.locators.map).toBeHidden();
    await expect(on(page).main.locators.buttons.mobileMapFab).toBeVisible();
    // The map is never focused on a single tour in the background on mobile
    // (see closeDetailPanel's mobile branch), so there's nothing for this
    // button to reset — the FAB is the only way to the map.
    await expect(on(page).main.locators.buttons.showAll).toBeHidden();
  });

  buddyTest(
    "closing a tour's detail panel returns to the list with nothing selected",
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.tapTour('Mobile Map Tour A');
      await expect(on(page).main.locators.detail.name).toHaveText('Mobile Map Tour A');

      await on(page).main.do.closeDetail();

      await expect(on(page).main.locators.detail.panel).toBeHidden();
      await expect(on(page).main.locators.list.active).toHaveCount(0);
    },
  );

  buddyTest('the FAB opens the map full-screen over all tours', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.openMobileMap();

    await expect(on(page).main.locators.map).toBeVisible();
    await expect(on(page).main.locators.sidebar).toBeHidden();

    // Closing (the same expand/restore toggle) returns to the list.
    await on(page).main.do.toggleSidebar();
    await expect(on(page).main.locators.sidebar).toBeVisible();
    await expect(on(page).main.locators.map).toBeHidden();
  });

  buddyTest(
    'the FAB opens the map over only the checked tours in select mode',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.longPressTour('Mobile Map Tour A');
      await expect(on(page).main.locators.selection.count).toHaveText('1 selected');

      await on(page).main.do.openMobileMap();
      await expect(on(page).main.locators.map).toBeVisible();
    },
  );

  buddyTest(
    'the detail panel shows a live map preview with a working fullscreen button',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.tapTour('Mobile Map Tour A');
      await expect(on(page).main.locators.detail.name).toHaveText('Mobile Map Tour A');
      await expect(on(page).main.locators.map).toBeVisible();

      // Expand from the preview goes full-screen, hiding the detail panel...
      await on(page).main.do.toggleSidebar();
      await expect(on(page).main.locators.map).toBeVisible();
      await expect(on(page).main.locators.detail.panel).toBeHidden();

      // ...and collapsing it returns the map to the still-open detail panel.
      await on(page).main.do.toggleSidebar();
      await expect(on(page).main.locators.detail.panel).toBeVisible();
      await expect(on(page).main.locators.map).toBeVisible();
    },
  );
});
