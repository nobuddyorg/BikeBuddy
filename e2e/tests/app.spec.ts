import { buddyTest, expect } from '../pages/buddy-test';

// These run against the static frontend (no backend): devMode falls back to a
// synthetic local user, so auth/list/empty-state UI is deterministic.

buddyTest.describe('BikeBuddy static UI', () => {
  buddyTest.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  buddyTest('loads and auto signs in (dev mode)', async ({ on, page }) => {
    await expect(page).toHaveTitle(/BikeBuddy/);
    await expect(on(page).main.locators.map).toBeVisible();
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.buttons.login).toBeHidden();
    await expect(on(page).main.locators.buttons.upload).toBeEnabled();
  });

  buddyTest('shows the empty state when there are no tours', async ({ on, page }) => {
    await expect(on(page).main.locators.list.empty).toBeVisible();
    await expect(on(page).main.locators.list.count).toHaveText('0');
  });

  buddyTest('upload modal opens, rejects a non-GPX file, and closes', async ({ on, page }) => {
    await on(page).main.do.openUpload();
    await expect(on(page).modal.upload()).toBeVisible();

    await on(page).modal.upload.do.pickFile({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a gpx'),
    });
    await expect(on(page).modal.upload.locators.error).toBeVisible();
    await expect(on(page).modal.upload.locators.error).toContainText('.gpx');

    await on(page).modal.upload.do.close();
    await expect(on(page).modal.upload()).toBeHidden();
  });

  buddyTest('upload modal accepts a .gpx file (enables submit)', async ({ on, page }) => {
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

  buddyTest('profile modal shows the signed-in user and closes', async ({ on, page }) => {
    await on(page).main.do.openProfile();
    await expect(on(page).modal.profile()).toBeVisible();
    await expect(on(page).modal.profile.locators.email).toContainText('@');
    await on(page).modal.profile.do.close();
    await expect(on(page).modal.profile()).toBeHidden();
  });

  buddyTest('sign out returns to the signed-out state', async ({ on, page }) => {
    await on(page).main.do.logout();
    await expect(on(page).main.locators.buttons.login).toBeVisible();
    await expect(on(page).main.locators.userMenu).toBeHidden();
    await expect(on(page).main.locators.authPrompt).toBeVisible();
  });

  buddyTest('help modal explains the app and closes', async ({ on, page }) => {
    await on(page).main.do.openHelp();
    await expect(on(page).modal.help()).toBeVisible();
    await expect(on(page).modal.help()).toContainText('How to use BikeBuddy');
    await expect(on(page).modal.help()).toContainText('Upload GPX');
    await on(page).modal.help.do.close();
    await expect(on(page).modal.help()).toBeHidden();
  });

  buddyTest('modals close on Escape and restore focus to the opener', async ({ on, page }) => {
    await on(page).main.locators.buttons.help.focus();
    await on(page).main.do.openHelp();
    await expect(on(page).modal.help()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(on(page).modal.help()).toBeHidden();
    await expect(on(page).main.locators.buttons.help).toBeFocused();
  });

  buddyTest(
    'profile button is a compact avatar; expand toggle collapses the sidebar',
    async ({ on, page }) => {
      await expect(on(page).main.locators.buttons.profile).toHaveClass(/btn-avatar/);
      await expect(on(page).main.locators.buttons.profile).toHaveText('LD'); // "Local Dev" initials

      await expect(on(page).main.locators.sidebar).toBeVisible();
      await on(page).main.do.toggleSidebar();
      await expect(on(page).main.locators.sidebar).toBeHidden();
      await on(page).main.do.toggleSidebar();
      await expect(on(page).main.locators.sidebar).toBeVisible();
    },
  );

  buddyTest(
    'mobile viewport: layout stays usable with no horizontal overflow',
    async ({ on, page }) => {
      await page.setViewportSize({ width: 375, height: 720 });
      await page.goto('/');
      await expect(on(page).main.locators.map).toBeVisible();
      await expect(on(page).main.locators.userMenu).toBeVisible();
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows).toBe(false);
    },
  );

  buddyTest('language switcher: search + select German translates the UI', async ({ on, page }) => {
    // Default is English (CI browser is en-US).
    await expect(on(page).main.locators.buttons.upload).toHaveText('Upload GPX');

    await on(page).main.do.switchLanguage({ search: 'deu', pick: 'Deutsch' });

    // Selecting persists the choice and reloads; the UI comes back in German.
    await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');
    await expect(page.getByText('Meine Touren')).toBeVisible();
  });
});
