import { expect, mockPhoto, mockTour, staticTest } from '../fixtures/api-mocks';

// A tour without photos fits a phone screen; one with photos scrolls; the list behind stays put.

const HEATMAP: [number, number][] = [
  [48.1, 11.5],
  [48.2, 11.6],
];

// Enough photos that the panel outgrows the screen and has to scroll.
const PHOTOS = Array.from({ length: 12 }, (_, index) =>
  mockPhoto({ id: `88888888-8888-4888-8888-${String(index).padStart(12, '0')}` }),
);

// Enough rows that the list outgrows the screen, so the page behind the panel could scroll.
const OTHER_TOURS = Array.from({ length: 20 }, (_, index) =>
  mockTour({
    id: `99999999-9999-4999-8999-${String(index).padStart(12, '0')}`,
    name: `Other Tour ${index + 1}`,
  }),
);

staticTest.use({
  viewport: { width: 390, height: 760 },
  mockAccount: {
    tours: [
      mockTour({
        id: '99999999-9999-4999-8999-999999999999',
        name: 'Short Phone Tour',
        description: 'Coffee stop at the lake.',
        createdAt: '2026-08-01T00:00:00.000Z',
        heatmapData: HEATMAP,
      }),
      mockTour({
        id: '88888888-8888-4888-8888-888888888888',
        name: 'Photo Tour',
        createdAt: '2026-08-02T00:00:00.000Z',
        heatmapData: HEATMAP,
        images: PHOTOS,
      }),
      ...OTHER_TOURS,
    ],
  },
});

staticTest.describe('a tour without photos', () => {
  staticTest.beforeEach(async ({ on, page }) => {
    await page.goto('/');
    await on(page).list.row('Short Phone Tour').do.click();
    await expect(on(page).detail.locators.name).toHaveText('Short Phone Tour');
  });

  staticTest('fits one phone screen', async ({ on, page }) => {
    const overflow = await on(page)
      .detail()
      .evaluate((panel) => panel.scrollHeight - panel.clientHeight);
    expect(overflow).toBe(0);
    await on(page).a11y.check('tour detail on a phone');
  });

  staticTest('leaves the list behind it put when scrolled over', async ({ on, page }) => {
    await on(page).detail.do.scrollWithWheel(400);

    const pageScroll = await on(page)
      .main()
      .evaluate(() => window.scrollY);
    expect(pageScroll).toBe(0);
  });
});

staticTest('a tour with many photos scrolls down to its buttons', async ({ on, page }) => {
  await page.goto('/');
  await on(page).list.row('Photo Tour').do.click();
  await expect(on(page).detail.locators.photos.thumbnails).toHaveCount(PHOTOS.length);
  await expect(on(page).detail.locators.buttons.delete).not.toBeInViewport();

  await on(page).detail.do.scrollWithWheel(2000);

  await expect(on(page).detail.locators.buttons.delete).toBeInViewport();
  const pageScroll = await on(page)
    .main()
    .evaluate(() => window.scrollY);
  expect(pageScroll).toBe(0);
});
