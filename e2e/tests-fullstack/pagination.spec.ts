import { expect, fullstackTest } from './fullstack-test';

// #230: the sidebar list paginates at 10 tours per page. The page arithmetic is
// unit-tested (frontend/test/tours.test.js); these are one step of each journey.

// Eleven matching tours plus one other: two pages, and still two after searching.
const MATCHING_TOURS = 11;

fullstackTest.describe('tour list pagination', () => {
  fullstackTest.beforeEach(async ({ seed }) => {
    for (let number = 1; number <= MATCHING_TOURS; number++) {
      const day = String(MATCHING_TOURS + 2 - number).padStart(2, '0');
      await seed.tour({ name: `Pagination Tour ${number}`, time: `2026-06-${day}T08:00:00Z` });
    }
    await seed.tour({ name: 'Zzyzx Unique Tour', time: '2026-06-01T08:00:00Z' });
  });

  fullstackTest('pages forward and back', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).list.locators.count).toHaveText('12');
    await expect(on(page).list.locators.names).toHaveCount(10);
    await expect(on(page).list.locators.pager.label).toHaveText('Page 1 of 2');
    await expect(on(page).list.locators.pager.previous).toBeDisabled();

    await on(page).list.do.nextPage();
    await expect(on(page).list.locators.names).toHaveText([
      'Pagination Tour 11',
      'Zzyzx Unique Tour',
    ]);
    await expect(on(page).list.locators.pager.label).toHaveText('Page 2 of 2');
    await expect(on(page).list.locators.pager.next).toBeDisabled();

    await on(page).list.do.previousPage();
    await expect(on(page).list.locators.pager.label).toHaveText('Page 1 of 2');
  });

  fullstackTest(
    'searching resets to page 1 even when results still span pages',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).list.do.nextPage();
      await expect(on(page).list.locators.pager.label).toHaveText('Page 2 of 2');

      // All eleven "Pagination Tour N" still span two pages, so page 2 would stay in range:
      // this proves the explicit reset on search, not clamping.
      await on(page).list.do.search('pagination tour');
      await expect(on(page).list.locators.names).toHaveCount(10);
      await expect(on(page).list.locators.pager.label).toHaveText('Page 1 of 2');
    },
  );

  fullstackTest('the pager hides once search results fit on one page', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).list.do.nextPage();
    await on(page).list.do.search('zzyzx');
    await expect(on(page).list.locators.names).toHaveText(['Zzyzx Unique Tour']);
    await expect(on(page).list.locators.pager.container).toBeHidden();
  });
});
