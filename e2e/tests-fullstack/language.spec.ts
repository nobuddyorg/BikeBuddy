import { expect, fullstackTest } from './fullstack-test';
import { devUserProfiles } from './store';

fullstackTest.describe('language preference', () => {
  fullstackTest(
    'switching language in settings persists it and translates the UI',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.buttons.upload).toHaveText('Upload GPX');

      await on(page).main.do.openProfile();
      await expect(on(page).modal.profile()).toBeVisible();
      await on(page).modal.profile.do.switchLanguage({ search: 'deu', code: 'de' });

      // Selecting PATCHes /api/me and reloads; the UI comes back in German.
      await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');
      await expect(on(page).main.locators.sidebarTitle).toHaveText('Meine Touren');

      const [profile] = await devUserProfiles();
      expect(profile.language).toBe('de');
    },
  );

  fullstackTest(
    'a fresh session with no local override picks up the saved backend language',
    async ({ on, page }) => {
      await page.goto('/');
      await on(page).main.do.openProfile();
      await on(page).modal.profile.do.switchLanguage({ search: 'deu', code: 'de' });
      await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');

      // A second device: no local choice, only the account's.
      await on(page).main.do.forgetLocalSettings();
      await page.reload();

      // Browser detection first, then GET /api/me's saved language.
      await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');
    },
  );
});
