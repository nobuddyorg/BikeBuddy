import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// A ride recorded in two GPX segments, a day and a train ride apart: the map draws two lines,
// never one joined across the gap (#552). The canvas renderer leaves no element per line, so the
// map reports how many it drew.

const TWO_RIDES = mockTour({
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Munich, then Berlin',
  heatmapData: [
    [48.1, 11.5],
    [48.2, 11.6],
    [52.5, 13.4],
    [52.6, 13.5],
  ],
  segmentStarts: [2],
});
const ONE_RIDE = mockTour({
  id: '66666666-6666-4666-8666-666666666666',
  name: 'Isar loop',
  heatmapData: [
    [48.0, 11.5],
    [48.05, 11.55],
  ],
});

staticTest.describe('a tour recorded in two segments', () => {
  staticTest.use({ mockAccount: { tours: [TWO_RIDES, ONE_RIDE] } });

  staticTest(
    'draws each segment as its own line, on the overview and in the detail',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).list.locators.count).toHaveText('2');

      // Two segments of one tour, plus the one-segment tour.
      await expect(on(page).map()).toHaveAttribute('data-route-lines', '3');

      await on(page).list.row('Munich, then Berlin').do.click();
      await expect(on(page).detail.locators.name).toHaveText('Munich, then Berlin');
      await expect(on(page).map()).toHaveAttribute('data-route-lines', '2');
    },
  );
});
