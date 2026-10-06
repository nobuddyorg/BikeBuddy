import type { Page } from '@playwright/test';
import { expect, mockTour, staticTest } from '../fixtures/api-mocks';
import { fakeEntra, type FakeEntra } from '../fixtures/fake-entra';

// The real MSAL against a fake tenant: the redirect sign-in, this page doubling as the redirect
// bridge, and the renewals after Entra's 24-hour cap on a SPA's refresh token.
const test = staticTest.extend<{ entra: FakeEntra; healthChecks: string[] }>({
  entra: async ({ page }, use) => {
    await use(await fakeEntra(page));
  },
  healthChecks: [
    async ({ page }, use) => {
      const requested: string[] = [];
      await page.route('**/api/v1/health', (route) => {
        requested.push(route.request().url());
        return route.fulfill({ contentType: 'application/json', body: '{"status":"ok"}' });
      });
      await use(requested);
    },
    { auto: true },
  ],
});

test.use({
  // The browser logs the fake tenant's refusal of an expired refresh token (AADSTS700084).
  allowedConsoleErrors: { matching: [/status of 400 .*oauth2\/v2\.0\/token/] },
  mockAccount: {
    tours: [mockTour({ id: '11111111-1111-4111-8111-111111111111', name: 'Alpine Loop' })],
  },
});

const topLevel = (entra: FakeEntra) => entra.authorizeVisits.filter((visit) => !visit.inIframe);
const silentInIframe = (entra: FakeEntra) =>
  entra.authorizeVisits.filter((visit) => visit.inIframe && visit.prompt === 'none');

async function signIn(page: Page, on: Parameters<Parameters<typeof test>[2]>[0]['on']) {
  await page.goto('/');
  await on(page).main.locators.buttons.login.click();
  // Settled: no token request of this load may meet the tenant state the test changes next.
  await expect(on(page).list.row('Alpine Loop')()).toBeVisible();
}

test('signs in through a redirect, without a popup, and wakes the API on load', async ({
  on,
  page,
  entra,
  healthChecks,
}) => {
  await page.goto('/');
  await expect(on(page).main.locators.buttons.login).toBeVisible();
  expect(healthChecks).toHaveLength(1);

  await on(page).main.locators.buttons.login.click();

  await expect(on(page).main.locators.userMenu).toBeVisible();
  await expect(on(page).list.row('Alpine Loop')()).toBeVisible();
  expect(entra.authorizeVisits).toEqual([{ prompt: null, inIframe: false }]);
  expect(page.context().pages()).toHaveLength(1);
});

test('renews an expired refresh token through the hidden iframe, without a click', async ({
  on,
  page,
  entra,
}) => {
  await signIn(page, on);
  entra.refreshTokens = 'expired';

  await page.reload();

  await expect(on(page).main.locators.userMenu).toBeVisible();
  await expect(on(page).list.row('Alpine Loop')()).toBeVisible();
  expect(silentInIframe(entra)).toHaveLength(1);
  expect(topLevel(entra)).toHaveLength(1);
});

test('renews through one silent redirect when the iframe cannot see the Entra session', async ({
  on,
  page,
  entra,
}) => {
  await signIn(page, on);
  entra.refreshTokens = 'expired';
  entra.session = 'hidden-from-iframes';

  await page.reload();

  await expect(on(page).main.locators.userMenu).toBeVisible();
  await expect(on(page).list.row('Alpine Loop')()).toBeVisible();
  expect(topLevel(entra)).toEqual([
    { prompt: null, inIframe: false },
    { prompt: 'none', inIframe: false },
  ]);
});

test('renews silently after a browser restart dropped the cached account', async ({
  on,
  page,
  entra,
}) => {
  await signIn(page, on);
  // MSAL's cache key lives in a session cookie: a browser restart loses it, and the account with it.
  await page.context().clearCookies();

  await page.reload();

  await expect(on(page).main.locators.userMenu).toBeVisible();
  expect(topLevel(entra).at(-1)).toEqual({ prompt: 'none', inIframe: false });
});

test('asks once to sign in again when the Entra session has ended too, without looping', async ({
  on,
  page,
  entra,
}) => {
  await signIn(page, on);
  entra.refreshTokens = 'expired';
  entra.session = 'ended';

  await page.reload();

  const ended = on(page).main.locators.alerts.filter({ hasText: 'Your session has ended' });
  await expect(ended).toBeVisible();
  await expect(on(page).main.locators.buttons.login).toBeVisible();
  await expect(on(page).main.locators.userMenu).toBeHidden();

  await page.reload();
  await expect(on(page).main.locators.buttons.login).toBeVisible();
  expect(topLevel(entra).filter((visit) => visit.prompt === 'none')).toHaveLength(1);
});

test('signing out ends the session at Entra and stays signed out', async ({ on, page, entra }) => {
  await signIn(page, on);

  await on(page).main.do.logout();

  await expect(on(page).main.locators.buttons.login).toBeVisible();
  expect(entra.logoutVisits).toBe(1);

  await page.reload();
  await expect(on(page).main.locators.buttons.login).toBeVisible();
  expect(entra.authorizeVisits).toHaveLength(1);
});
