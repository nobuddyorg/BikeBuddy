import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours } from './usersDb';

// Sorting + fuzzy search over the tour list, against the real backend.
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

buddyTest.describe('tour list: sort + fuzzy search', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
  });

  buddyTest('fuzzy search filters and sort reorders the list', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    for (const t of TOURS)
      await on(page).main.do.uploadGpx({ name: t.name, gpx: gpx(t.name, t.lon2) });

    // One step each: the matching and ordering rules are unit-tested (frontend/test/tours.test.js).
    await on(page).list.do.search('cstrn'); // a subsequence of "Coastal Run"
    await expect(on(page).list.locators.names).toHaveText(['Coastal Run']);

    await on(page).list.do.search('');
    await on(page).list.do.sortBy('length-desc');
    await expect(on(page).list.locators.names).toHaveText([
      'Coastal Run',
      'Black Forest',
      'Alpine Loop',
    ]);
  });
});
