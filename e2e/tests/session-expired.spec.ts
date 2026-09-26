import type { Route } from '@playwright/test';
import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

staticTest.use({
  allowedConsoleErrors: { matching: [/status of 401/] },
  mockAccount: {
    tours: [mockTour({ id: '11111111-1111-4111-8111-111111111111', name: 'Alpine Loop' })],
  },
});

// The API refuses the token even after one fresh try: the app asks the user to sign in again.
staticTest(
  'an expired session asks to sign in again, and signing in from there recovers',
  async ({ on, page }) => {
    const refuse = (route: Route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'errors.unauthorized' }),
      });
    await page.route('**/api/tours', refuse);

    await page.goto('/');

    const expired = on(page).main.locators.alerts.filter({ hasText: 'Your session has ended' });
    await expect(expired).toBeVisible();
    await expect(on(page).main.locators.buttons.login).toBeVisible();
    await expect(on(page).main.locators.userMenu).toBeHidden();

    await page.unroute('**/api/tours', refuse);
    await expired.getByRole('button', { name: 'Sign In' }).click();

    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).list.row('Alpine Loop')()).toBeVisible();
  },
);
