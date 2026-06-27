import { test, expect } from '@playwright/test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// Photo pins (#100): markers for geotagged images, default hidden, toggled on.
// Seed a tour with a geotagged image directly so GetTour returns lat/lon (no
// real upload needed; the SAS url is signed even if the blob is absent).

const TID = '22222222-2222-4222-8222-222222222222';
const IID = '33333333-3333-4333-8333-333333333333';
const IID2 = '44444444-4444-4444-8444-444444444444';

test.describe('photo pins', () => {
  test.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    await toursContainer().items.create({
      id: TID,
      userId: 'local-dev-user',
      name: 'Geotagged Tour',
      distance: 5,
      createdAt: new Date().toISOString(),
      heatmapData: [
        [48.1, 11.5],
        [48.2, 11.6],
      ],
      // Two photos at the SAME coordinates → both must be shown (fanned), not
      // stacked into one (#126).
      images: [
        { id: IID, blobName: `local-dev-user/${TID}/${IID}.jpg`, lat: 48.1, lon: 11.5 },
        { id: IID2, blobName: `local-dev-user/${TID}/${IID2}.jpg`, lat: 48.1, lon: 11.5 },
      ],
    });
  });

  test('toggle off by default; reveals both co-located pins fanned out', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#user-menu')).toBeVisible();
    await expect(page.locator('#tour-list')).toContainText('Geotagged Tour');

    // Toggle visible (geotagged images exist) but off → no pins.
    await expect(page.locator('#pin-toggle')).toBeVisible();
    await expect(page.locator('#pin-toggle-input')).not.toBeChecked();
    await expect(page.locator('.photo-pin')).toHaveCount(0);

    // Turn on → both co-located pins appear (fanned, each clickable).
    await page.locator('#pin-toggle-input').check();
    await expect(page.locator('.photo-pin')).toHaveCount(2);

    // Turn off → pins removed.
    await page.locator('#pin-toggle-input').uncheck();
    await expect(page.locator('.photo-pin')).toHaveCount(0);
  });
});
