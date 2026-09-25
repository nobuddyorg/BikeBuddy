import { readFileSync } from 'node:fs';
import { expect, fullstackTest } from './fullstack-test';
import { DEV_USER_ID, devUserBlobNames, devUserProfiles, devUserTours } from './store';

// GDPR account export + deletion against the real backend, checked in the store.

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Account Tour</name></metadata>
  <trk><trkseg>
    <trkpt lat="48.1" lon="11.5"/>
    <trkpt lat="48.2" lon="11.6"/>
  </trkseg></trk>
</gpx>`;

fullstackTest('export downloads the account; delete removes all of it', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();
  await on(page).main.do.uploadGpx({ name: 'Account Tour', gpx: GPX });

  await on(page).main.do.openProfile();
  await expect(on(page).modal.profile()).toBeVisible();
  await on(page).a11y.check('profile modal with data');

  const downloadPromise = page.waitForEvent('download');
  await on(page).modal.profile.do.exportData();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('bikebuddy-export.json');
  const exported = JSON.parse(readFileSync(await download.path(), 'utf8')) as {
    user: { id: string };
    tours: { name: string }[];
  };
  expect(exported.user.id).toBe(DEV_USER_ID);
  expect(exported.tours.map((tour) => tour.name)).toEqual(['Account Tour']);

  expect(await devUserBlobNames()).not.toEqual([]);
  await on(page).modal.profile.do.deleteAccount();
  await expect(on(page).main.locators.buttons.login).toBeVisible();
  await expect(on(page).main.locators.userMenu).toBeHidden();

  expect(await devUserProfiles()).toEqual([]);
  expect(await devUserTours()).toEqual([]);
  expect(await devUserBlobNames()).toEqual([]);
});
