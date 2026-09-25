import { expect, fullstackTest } from './fullstack-test';

// Fuzzy search and sort over the tour list, against the real backend's distances.
// One step each: the matching and ordering rules are unit-tested (frontend/test/tours.test.js).

// A longer longitude span is a longer track: Alpine < Black < Coastal.
const TOURS: { name: string; endLongitude: number }[] = [
  { name: 'Alpine Loop', endLongitude: 11.01 },
  { name: 'Black Forest', endLongitude: 11.1 },
  { name: 'Coastal Run', endLongitude: 12 },
];

fullstackTest.describe('tour list: sort + fuzzy search', () => {
  fullstackTest.beforeEach(async ({ seed }) => {
    for (const { name, endLongitude } of TOURS) {
      await seed.tour({
        name,
        time: '2026-06-01T08:00:00Z',
        points: [
          [48, 11],
          [48, endLongitude],
        ],
      });
    }
  });

  fullstackTest('fuzzy search filters and sort reorders the list', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

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
