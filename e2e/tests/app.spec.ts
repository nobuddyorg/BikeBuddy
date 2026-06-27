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

test('help modal explains the app and closes', async ({ page }) => {
  await page.locator('#btn-help').click();
  await expect(page.locator('#help-modal')).toBeVisible();
  await expect(page.locator('#help-modal')).toContainText('How to use BikeBuddy');
  await expect(page.locator('#help-modal')).toContainText('Upload GPX');
  await page.locator('#btn-close-help').click();
  await expect(page.locator('#help-modal')).toBeHidden();
});

test('modals close on Escape and restore focus to the opener', async ({ page }) => {
  await page.locator('#btn-help').focus();
  await page.locator('#btn-help').click();
  await expect(page.locator('#help-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-modal')).toBeHidden();
  await expect(page.locator('#btn-help')).toBeFocused();
});

test('profile button is a compact avatar; expand toggle collapses the sidebar', async ({
  page,
}) => {
  await expect(page.locator('#btn-profile')).toHaveClass(/btn-avatar/);
  await expect(page.locator('#btn-profile')).toHaveText('DE'); // dev@localhost → "DE"

  await expect(page.locator('.sidebar')).toBeVisible();
  await page.locator('#btn-map-expand').click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.locator('#btn-map-expand').click();
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('mobile viewport: layout stays usable with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#user-menu')).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});
