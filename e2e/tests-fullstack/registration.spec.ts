import { expect, fullstackTest } from './fullstack-test';
import { DEV_USER_ID, devUserProfiles } from './store';

// Registration = the first authenticated visit provisioning a user record (GET
// /api/me creates the document). Each test starts without the dev user's
// document, so it proves the record is created, not merely already present.
// devMode + SKIP_AUTH supply the identity, so this covers the app's own
// provisioning rather than the Entra OTP UI.

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

fullstackTest.describe('user registration', () => {
  fullstackTest('first login provisions exactly one user record', async ({ on, page }) => {
    expect(await devUserProfiles()).toEqual([]);

    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible(); // /api/me succeeded

    const profiles = await devUserProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe(DEV_USER_ID);
    expect(profiles[0].createdAt).toMatch(ISO_TIMESTAMP);
  });

  fullstackTest('revisiting does not create a duplicate user', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    const [first] = await devUserProfiles();
    expect(first.createdAt).toMatch(ISO_TIMESTAMP);

    await page.goto('/'); // second login for the same identity
    await expect(on(page).main.locators.userMenu).toBeVisible();

    const profiles = await devUserProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].createdAt).toBe(first.createdAt); // the same record, not re-created
  });
});
