import { expect, staticTest } from '../fixtures/api-mocks';

// Until the deletion job removes the identity, the API refuses it with 410 (#538).
staticTest.use({ allowedConsoleErrors: { matching: [/status of 410/] } });

staticTest(
  'signing in while the account deletion is queued signs straight out',
  async ({ on, page }) => {
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'errors.accountDeleted' }),
      }),
    );

    await page.goto('/');

    await expect(on(page).main.locators.alerts).toHaveText(
      "This account is being deleted. It can't be used any more.",
    );
    await expect(on(page).main.locators.buttons.login).toBeVisible();
    await expect(on(page).main.locators.userMenu).toBeHidden();
  },
);
