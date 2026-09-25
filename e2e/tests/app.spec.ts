import { expect, staticTest } from '../fixtures/api-mocks';

// The static frontend in devMode against the mocked API of an account with no tours.

staticTest.describe('BikeBuddy static UI', () => {
  staticTest.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  staticTest('loads and auto signs in (dev mode)', async ({ on, page }) => {
    await expect(page).toHaveTitle(/BikeBuddy/);
    await expect(on(page).map()).toBeVisible();
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.buttons.login).toBeHidden();
    await expect(on(page).main.locators.buttons.upload).toBeEnabled();
    await expect(on(page).main.locators.authPrompt).toBeHidden();
    await on(page).a11y.check('signed in, empty list');
  });

  staticTest('shows the empty state when there are no tours', async ({ on, page }) => {
    await expect(on(page).list.locators.empty).toBeVisible();
    await expect(on(page).list.locators.count).toHaveText('0');
  });

  staticTest.describe('when the tour load fails', () => {
    staticTest.use({ allowedConsoleErrors: { matching: [/status of 500/] } });

    staticTest('shows a retry-able error, and recovers', async ({ on, page }) => {
      let failing = true;
      await page.route('**/api/tours', (route) =>
        failing
          ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
          : route.fallback(),
      );
      await page.reload();

      await expect(on(page).list.locators.loadError).toBeVisible();
      await expect(on(page).list.locators.empty).toBeHidden();
      await expect(on(page).map.locators.loadError).toBeVisible();
      await on(page).a11y.check('tour load error');

      failing = false;
      await on(page).list.do.retryLoad();

      await expect(on(page).list.locators.loadError).toBeHidden();
      await expect(on(page).list.locators.empty).toBeVisible();
    });
  });

  staticTest('upload modal opens, rejects a non-GPX file, and closes', async ({ on, page }) => {
    await on(page).main.do.openUpload();
    await expect(on(page).modal.upload()).toBeVisible();

    await on(page).modal.upload.do.pickFile({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a gpx'),
    });
    await expect(on(page).modal.upload.locators.error).toBeVisible();
    await expect(on(page).modal.upload.locators.error).toContainText('.gpx');
    await on(page).a11y.check('upload modal with a file error');

    await on(page).modal.upload.do.close();
    await expect(on(page).modal.upload()).toBeHidden();
  });

  staticTest('upload modal accepts a .gpx file (enables submit)', async ({ on, page }) => {
    await on(page).main.do.openUpload();
    await on(page).modal.upload.do.pickFile({
      name: 'ride.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from('<?xml version="1.0"?><gpx></gpx>'),
    });
    await expect(on(page).modal.upload.locators.dropzoneFilename).toContainText('ride.gpx');
    await expect(on(page).modal.upload.locators.buttons.submit).toBeEnabled();
    await expect(on(page).modal.upload.locators.error).toBeHidden();
  });

  staticTest('profile modal shows the signed-in user and closes', async ({ on, page }) => {
    await on(page).main.do.openProfile();
    await expect(on(page).modal.profile()).toBeVisible();
    await expect(on(page).modal.profile.locators.email).toContainText('@');
    await on(page).a11y.check('profile modal');
    await on(page).modal.profile.do.close();
    await expect(on(page).modal.profile()).toBeHidden();
  });

  staticTest('sign out returns to the signed-out state', async ({ on, page }) => {
    await on(page).main.do.logout();
    await expect(on(page).main.locators.buttons.login).toBeVisible();
    await expect(on(page).main.locators.userMenu).toBeHidden();
    await expect(on(page).main.locators.authPrompt).toBeVisible();
    await on(page).a11y.check('signed out');
  });

  staticTest('help modal explains the app and closes', async ({ on, page }) => {
    await on(page).main.do.openHelp();
    await expect(on(page).modal.help()).toBeVisible();
    await expect(on(page).modal.help()).toContainText('How to use BikeBuddy');
    await expect(on(page).modal.help()).toContainText('Upload GPX');
    await on(page).a11y.check('help modal');
    await on(page).modal.help.do.close();
    await expect(on(page).modal.help()).toBeHidden();
  });

  staticTest('modals close on Escape and restore focus to the opener', async ({ on, page }) => {
    await on(page).main.locators.buttons.help.focus();
    await on(page).main.do.openHelp();
    await expect(on(page).modal.help()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(on(page).modal.help()).toBeHidden();
    await expect(on(page).main.locators.buttons.help).toBeFocused();
  });

  staticTest(
    'profile button shows the initials; expand toggle collapses the sidebar',
    async ({ on, page }) => {
      await expect(on(page).main.locators.buttons.profile).toHaveText('LD'); // "Local Dev" initials

      await expect(on(page).main.locators.sidebar).toBeVisible();
      await on(page).main.do.toggleSidebar();
      await expect(on(page).main.locators.sidebar).toBeHidden();
      await on(page).main.do.toggleSidebar();
      await expect(on(page).main.locators.sidebar).toBeVisible();
    },
  );

  staticTest(
    'mobile viewport: layout stays usable with no horizontal overflow',
    async ({ on, page }) => {
      await page.setViewportSize({ width: 375, height: 720 });
      await page.goto('/');
      // On a phone the list is the home screen; the map waits behind the FAB.
      await expect(on(page).main.locators.sidebar).toBeVisible();
      await expect(on(page).list.locators.empty).toBeVisible();
      await expect(on(page).main.locators.userMenu).toBeVisible();
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows).toBe(false);
      await on(page).a11y.check('mobile list');
    },
  );
});
