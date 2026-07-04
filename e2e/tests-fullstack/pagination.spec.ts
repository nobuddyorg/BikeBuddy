import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #230: the sidebar list paginates at 20 tours/page. Seeds 25 tours directly
// into Cosmos (like photo-pins.spec.ts) since no real upload is needed to
// exercise list/search/pagination behavior.

buddyTest.describe('tour list pagination', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    const docs = Array.from({ length: 24 }, (_, i) => ({
      id: `pagination-tour-${i + 1}`,
      userId: 'local-dev-user',
      name: `Pagination Tour ${i + 1}`,
      distance: 10,
      createdAt: new Date(now - i * 60_000).toISOString(),
    }));
    docs.push({
      id: 'pagination-tour-unique',
      userId: 'local-dev-user',
      name: 'Zzyzx Unique Tour',
      distance: 10,
      createdAt: new Date(now - 25 * 60_000).toISOString(),
    });
    await Promise.all(docs.map((doc) => toursContainer().items.create(doc)));
  });

  buddyTest('pages through 25 tours, 20 per page', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.count).toHaveText('25');

    await expect(on(page).main.locators.list.names).toHaveCount(20);
    await expect(on(page).main.locators.pager.label).toHaveText('Page 1 of 2');
    await expect(on(page).main.locators.pager.prev).toBeDisabled();
    await expect(on(page).main.locators.pager.next).toBeEnabled();

    await on(page).main.do.pagerNext();
    await expect(on(page).main.locators.list.names).toHaveCount(5);
    await expect(on(page).main.locators.pager.label).toHaveText('Page 2 of 2');
    await expect(on(page).main.locators.pager.next).toBeDisabled();
    await expect(on(page).main.locators.pager.prev).toBeEnabled();

    await on(page).main.do.pagerPrev();
    await expect(on(page).main.locators.list.names).toHaveCount(20);
    await expect(on(page).main.locators.pager.label).toHaveText('Page 1 of 2');
  });

  buddyTest(
    'searching resets to page 1 even when results still span pages',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.pagerNext();
      await expect(on(page).main.locators.pager.label).toHaveText('Page 2 of 2');

      // Matches all 24 "Pagination Tour N" docs (excludes the "Zzyzx" one) — still
      // 2 pages, so this proves the explicit reset-on-search, not just clamping
      // (clamping alone wouldn't correct an in-range stale page number).
      await on(page).main.do.search('pagination tour');
      await expect(on(page).main.locators.list.names).toHaveCount(20);
      await expect(on(page).main.locators.pager.label).toHaveText('Page 1 of 2');
    },
  );

  buddyTest('the pager hides once search results fit on one page', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.pagerNext();
    await on(page).main.do.search('zzyzx');
    await expect(on(page).main.locators.list.names).toHaveText(['Zzyzx Unique Tour']);
    await expect(on(page).main.locators.pager.container).toBeHidden();
  });
});
