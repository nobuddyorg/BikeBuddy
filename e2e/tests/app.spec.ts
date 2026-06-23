import { test, expect } from '@playwright/test';

// These run against the static frontend (no backend): devMode falls back to a
// synthetic local user, so auth/list/empty-state UI is deterministic.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('loads and auto signs in (dev mode)', async ({ page }) => {
  await expect(page).toHaveTitle(/BikeBuddy/);
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#user-menu')).toBeVisible();
  await expect(page.locator('#btn-login')).toBeHidden();
  await expect(page.locator('#btn-upload')).toBeEnabled();
});

test('shows the empty state when there are no tours', async ({ page }) => {
  await expect(page.locator('#no-tours')).toBeVisible();
  await expect(page.locator('#tour-count')).toHaveText('0');
});

test('upload modal opens, rejects a non-GPX file, and closes', async ({ page }) => {
  await page.locator('#btn-upload').click();
  await expect(page.locator('#upload-modal')).toBeVisible();

  await page.locator('#upload-file').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a gpx'),
  });
  await expect(page.locator('#upload-error')).toBeVisible();
  await expect(page.locator('#upload-error')).toContainText('.gpx');

  await page.locator('#btn-close-upload').click();
  await expect(page.locator('#upload-modal')).toBeHidden();
});

test('upload modal accepts a .gpx file (enables submit)', async ({ page }) => {
  await page.locator('#btn-upload').click();
  await page.locator('#upload-file').setInputFiles({
    name: 'ride.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from('<?xml version="1.0"?><gpx></gpx>'),
  });
  await expect(page.locator('#dropzone-filename')).toContainText('ride.gpx');
  await expect(page.locator('#btn-submit-upload')).toBeEnabled();
  await expect(page.locator('#upload-error')).toBeHidden();
});

test('profile modal shows the signed-in user and closes', async ({ page }) => {
  await page.locator('#btn-profile').click();
  await expect(page.locator('#profile-modal')).toBeVisible();
  await expect(page.locator('#profile-email')).toContainText('@');
  await page.locator('#btn-close-profile').click();
  await expect(page.locator('#profile-modal')).toBeHidden();
});

test('sign out returns to the signed-out state', async ({ page }) => {
  await page.locator('#btn-logout').click();
  await expect(page.locator('#btn-login')).toBeVisible();
  await expect(page.locator('#user-menu')).toBeHidden();
  await expect(page.locator('#auth-prompt')).toBeVisible();
});
