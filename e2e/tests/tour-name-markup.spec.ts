import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// Names and descriptions are stored as typed (#574): markup in them is shown as text, never run.

const MARKUP_NAME = '<b>Alps</b> <img src=x onerror="window.markupRan=true">';
const MARKUP_DESCRIPTION = '<i>steep</i> & <script>window.markupRan=true</script>';

staticTest.use({
  mockAccount: {
    tours: [
      mockTour({
        id: '11111111-1111-4111-8111-111111111111',
        name: MARKUP_NAME,
        description: MARKUP_DESCRIPTION,
      }),
    ],
  },
});

staticTest(
  'a tour name with markup shows literally in the list and the detail',
  async ({ on, page }) => {
    await page.goto('/');
    const row = on(page).list.row(MARKUP_NAME);
    await expect(row.locators.name).toHaveText(MARKUP_NAME);

    // Searching wraps the match in <mark>; the rest of the name must stay text.
    await on(page).list.do.search('Alps');
    await expect(row.locators.name).toHaveText(MARKUP_NAME);
    await expect(row.locators.name.locator('b, img')).toHaveCount(0);

    await row.do.click();
    const detail = on(page).detail.locators;
    await expect(detail.name).toHaveText(MARKUP_NAME);
    await expect(detail.description).toHaveText(MARKUP_DESCRIPTION);
    await expect(detail.name.locator('b, img')).toHaveCount(0);
    expect(await page.evaluate(() => 'markupRan' in window)).toBe(false);
  },
);
