import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// A tour without photos fits a phone screen: stats and actions sit two to a row.

staticTest.use({
  viewport: { width: 390, height: 760 },
  mockAccount: {
    tours: [
      mockTour({
        id: '99999999-9999-4999-8999-999999999999',
        name: 'Short Phone Tour',
        description: 'Coffee stop at the lake.',
        heatmapData: [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
      }),
    ],
  },
});

staticTest('shows a tour without photos on one phone screen', async ({ on, page }) => {
  await page.goto('/');
  await on(page).list.row('Short Phone Tour').do.click();
  await expect(on(page).detail.locators.name).toHaveText('Short Phone Tour');
  await expect(on(page).detail.locators.buttons.delete).toBeVisible();

  const overflow = await on(page)
    .detail()
    .evaluate((panel) => panel.scrollHeight - panel.clientHeight);
  expect(overflow).toBe(0);
  await on(page).a11y.check('tour detail on a phone');
});
