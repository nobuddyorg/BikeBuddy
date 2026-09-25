import { readFileSync } from 'node:fs';
import { expect, staticTest } from '../fixtures/api-mocks';

const german = JSON.parse(
  readFileSync(new URL('../../frontend/src/locales/de.json', import.meta.url), 'utf8'),
) as Record<string, string>;

// The API answers with an i18n key; the user reads it in their own language, limits filled in.
staticTest.describe('an API error in German', () => {
  staticTest.use({ locale: 'de-DE', allowedConsoleErrors: { matching: [/status of 400/] } });

  staticTest.beforeEach(async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await on(page).main.do.openUpload();
    await on(page).modal.upload.do.pickFile({
      name: 'ride.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from('<?xml version="1.0"?><gpx></gpx>'),
    });
  });

  for (const { key, shown } of [
    { key: 'errors.gpxInvalid', shown: german['errors.gpxInvalid'] },
    { key: 'errors.fileSize', shown: german['errors.fileSize'].replace('{maxMegabytes}', '10') },
  ]) {
    staticTest(`shows ${key} translated`, async ({ on, page }) => {
      await page.route('**/api/tours/upload*', (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: key }),
        }),
      );

      await on(page).modal.upload.do.submit();

      await expect(on(page).modal.upload.locators.error).toHaveText(shown);
    });
  }
});
