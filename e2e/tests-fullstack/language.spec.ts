import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, listUsers } from './usersDb';

// Language selection lives in profile settings and persists to the user doc,
// unlike the old navbar-only, localStorage-only picker (#290).

buddyTest.describe('language preference', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
  });

  buddyTest(
    'switching language in settings persists it and translates the UI',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.buttons.upload).toHaveText('Upload GPX');

      await on(page).main.do.openProfile();
      await expect(on(page).modal.profile()).toBeVisible();
      await on(page).modal.profile.do.switchLanguage({ search: 'deu', pick: 'Deutsch' });

      // Selecting PATCHes /api/me and reloads; the UI comes back in German.
      await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');
      await expect(page.getByText('Meine Touren')).toBeVisible();

      const [user] = await listUsers();
      expect(user.language).toBe('de');
    },
  );

  buddyTest(
    'a fresh session with no local override picks up the saved backend language',
    async ({ on, page }) => {
      await page.goto('/');
      await on(page).main.do.openProfile();
      await on(page).modal.profile.do.switchLanguage({ search: 'deu', pick: 'Deutsch' });
      await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');

      // Simulate a different browser/device: no local override, but the
      // account still has the saved language.
      await page.evaluate(() => localStorage.removeItem('bikebuddy-lang'));
      await page.reload();

      // Momentarily falls back to browser detection, then devSignIn()'s
      // /api/me re-fetch sees the saved language and re-applies it.
      await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');
    },
  );
});
