import { buddyTest, expect } from '../pages/buddy-test';
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

    const list = on(page).main.locators.list.container;

    // Fuzzy search: non-contiguous subsequence still matches.
    await on(page).main.do.search('alp');
    await expect(list).toContainText('Alpine Loop');
    await expect(list).not.toContainText('Black Forest');
    await expect(list).not.toContainText('Coastal Run');

    await on(page).main.do.search('cstrn'); // subsequence of "Coastal Run"
    expect(await on(page).main.do.tourNames()).toEqual(['Coastal Run']);

    await on(page).main.do.search('zzz'); // no match
    await expect(list).toContainText('No tours match');

    await on(page).main.do.search('');

    // Sort by name.
    await on(page).main.do.sortBy('name-asc');
    expect(await on(page).main.do.tourNames()).toEqual([
      'Alpine Loop',
      'Black Forest',
      'Coastal Run',
    ]);
    await on(page).main.do.sortBy('name-desc');
    expect(await on(page).main.do.tourNames()).toEqual([
      'Coastal Run',
      'Black Forest',
      'Alpine Loop',
    ]);

    // Sort by length.
    await on(page).main.do.sortBy('length-desc');
    expect(await on(page).main.do.tourNames()).toEqual([
      'Coastal Run',
      'Black Forest',
      'Alpine Loop',
    ]);
    await on(page).main.do.sortBy('length-asc');
    expect(await on(page).main.do.tourNames()).toEqual([
      'Alpine Loop',
      'Black Forest',
      'Coastal Run',
    ]);
  });
});
