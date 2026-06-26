import { test, expect, type Page } from '@playwright/test';
import { clearUsers, clearTours } from './usersDb';

// Sorting + fuzzy search over the tour list (#102), against the real backend.
// Three tours with distinct names and lengths give a deterministic order.

const gpx = (name: string, lon2: string) => `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name></metadata>
  <trk><trkseg>
    <trkpt lat="48.0000" lon="11.0000"/>
    <trkpt lat="48.0000" lon="${lon2}"/>
  </trkseg></trk>
</gpx>`;

// lon span grows → distance grows: Alpine < Black < Coastal.
const TOURS = [
  { name: 'Alpine Loop', lon2: '11.0100' },
  { name: 'Black Forest', lon2: '11.1000' },
  { name: 'Coastal Run', lon2: '12.0000' },
];

async function uploadTour(page: Page, name: string, body: string) {
  await page.locator('#btn-upload').click();
  await page.locator('#upload-name').fill(name);
  await page.locator('#upload-file').setInputFiles({
    name: `${name}.gpx`,
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(body),
  });
  await expect(page.locator('#btn-submit-upload')).toBeEnabled();
  await page.locator('#btn-submit-upload').click();
  await expect(page.locator('#tour-list')).toContainText(name);
}

const listNames = (page: Page) => page.locator('#tour-list .tour-item-name').allTextContents();

test.describe('tour list: sort + fuzzy search', () => {
  test.beforeEach(async () => {
    await clearUsers();
    await clearTours();
  });

  test('fuzzy search filters and sort reorders the list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#user-menu')).toBeVisible();
    for (const t of TOURS) await uploadTour(page, t.name, gpx(t.name, t.lon2));

    // Fuzzy search: non-contiguous subsequence still matches.
    await page.locator('#tour-search').fill('alp');
    await expect(page.locator('#tour-list')).toContainText('Alpine Loop');
    await expect(page.locator('#tour-list')).not.toContainText('Black Forest');
    await expect(page.locator('#tour-list')).not.toContainText('Coastal Run');

    await page.locator('#tour-search').fill('cstrn'); // c-o-a-s-t-a-l ... subsequence of "Coastal Run"
    await expect(await listNames(page)).toEqual(['Coastal Run']);

    await page.locator('#tour-search').fill('zzz'); // no match
    await expect(page.locator('#tour-list')).toContainText('No tours match');

    await page.locator('#tour-search').fill('');

    // Sort by name.
    await page.locator('#tour-sort').selectOption('name-asc');
    expect(await listNames(page)).toEqual(['Alpine Loop', 'Black Forest', 'Coastal Run']);
    await page.locator('#tour-sort').selectOption('name-desc');
    expect(await listNames(page)).toEqual(['Coastal Run', 'Black Forest', 'Alpine Loop']);

    // Sort by length.
    await page.locator('#tour-sort').selectOption('length-desc');
    expect(await listNames(page)).toEqual(['Coastal Run', 'Black Forest', 'Alpine Loop']);
    await page.locator('#tour-sort').selectOption('length-asc');
    expect(await listNames(page)).toEqual(['Alpine Loop', 'Black Forest', 'Coastal Run']);
  });
});
