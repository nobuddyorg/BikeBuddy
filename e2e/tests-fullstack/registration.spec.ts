import { test, expect } from '@playwright/test';
import { clearUsers, listUsers } from './usersDb';

// Registration = first authenticated visit provisioning a user record (GET
// /api/me creates the doc on first login). Each test starts from a clean user
// DB so we can prove the record is created, not merely already present.
//
// Runs against the real backend (Functions + Cosmos emulator) behind the SWA
// proxy. devMode + SKIP_AUTH supply a deterministic local identity, so the test
// covers the app's own user provisioning rather than the Entra OTP UI.

test.describe('user registration', () => {
  test.beforeEach(async () => {
    await clearUsers();
  });

  test('first login provisions exactly one user record', async ({ page }) => {
    expect(await listUsers()).toHaveLength(0);

    await page.goto('/');
    await expect(page.locator('#user-menu')).toBeVisible(); // /api/me succeeded

    const users = await listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].id).toBeTruthy();
    expect(users[0].createdAt).toBeTruthy();
  });

  test('revisiting does not create a duplicate user', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#user-menu')).toBeVisible();
    const [first] = await listUsers();
    expect(first).toBeTruthy();

    await page.goto('/'); // second login for the same identity
    await expect(page.locator('#user-menu')).toBeVisible();

    const users = await listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(first.id);
    expect(users[0].createdAt).toBe(first.createdAt); // same record, not re-created
  });
});
