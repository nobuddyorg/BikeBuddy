import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

const ALPINE_LOOP_ID = '11111111-1111-4111-8111-111111111111';

staticTest.use({
  mockAccount: {
    tours: [
      mockTour({
        id: ALPINE_LOOP_ID,
        name: 'Alpine Loop',
        heatmapData: [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
      }),
    ],
  },
});

staticTest.describe('stacked dialogs', () => {
  staticTest.beforeEach(async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await on(page).main.do.openProfile();
    await expect(on(page).modal.profile()).toBeVisible();
  });

  staticTest('Escape closes only the dialog on top, one level at a time', async ({ on, page }) => {
    const deleteAccount = on(page).modal.profile.locators.deleteAccountModal;
    await on(page).modal.profile.do.openDeleteAccount();
    await expect(deleteAccount.root).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(deleteAccount.root).toBeHidden();
    await expect(on(page).modal.profile()).toBeVisible();
    await expect(on(page).modal.profile.locators.buttons.deleteAccount).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(on(page).modal.profile()).toBeHidden();
  });

  staticTest('Tab stays inside the dialog on top', async ({ on, page }) => {
    const deleteAccount = on(page).modal.profile.locators.deleteAccountModal;
    await on(page).modal.profile.do.openDeleteAccount();
    await expect(deleteAccount.input).toBeFocused();

    for (let press = 0; press < 6; press++) {
      await page.keyboard.press('Tab');
      await expect(deleteAccount.root.locator(':focus')).toHaveCount(1);
    }
  });

  staticTest(
    'Escape in the language menu closes the menu, not the profile',
    async ({ on, page }) => {
      await on(page).modal.profile.do.openLanguageMenu();
      await expect(on(page).modal.profile.locators.lang.menu).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(on(page).modal.profile.locators.lang.menu).toBeHidden();
      await expect(on(page).modal.profile()).toBeVisible();
    },
  );
});

staticTest.describe('history of closed layers', () => {
  staticTest(
    'closing the panel with its button takes its Back step with it',
    async ({ on, page }) => {
      await page.goto('/');
      await on(page).list.row('Alpine Loop').do.click();
      await expect(on(page).detail()).toBeVisible();

      await on(page).detail.do.close();

      await expect(on(page).detail()).toBeHidden();
      await expect(page).not.toHaveURL(/\/tour\//);
      // One Back now leaves the app; no dead entry of the closed panel is left to press through.
      await page.goBack();
      await expect(page).toHaveURL('about:blank');
    },
  );

  staticTest('after a reload, one Back closes the reopened tour', async ({ on, page }) => {
    await page.goto('/');
    await on(page).list.row('Alpine Loop').do.click();
    await expect(page).toHaveURL(new RegExp(`/tour/${ALPINE_LOOP_ID}`));

    await page.reload();
    await expect(on(page).detail.locators.name).toHaveText('Alpine Loop');

    await page.goBack();

    await expect(on(page).detail()).toBeHidden();
    await expect(on(page).main.locators.userMenu).toBeVisible();
  });
});

staticTest.describe('startup robustness', () => {
  staticTest('a malformed tour link opens the app without a tour', async ({ on, page }) => {
    await page.goto('/#/tour/%E0%A4%A');

    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).list.row('Alpine Loop')()).toBeVisible();
    await expect(on(page).detail()).toBeHidden();
  });

  staticTest('blocked storage still starts the app', async ({ on, page }) => {
    await page.addInitScript(() => {
      const blocked = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      Storage.prototype.getItem = blocked;
      Storage.prototype.setItem = blocked;
    });

    await page.goto('/');

    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).list.row('Alpine Loop')()).toBeVisible();
  });
});
