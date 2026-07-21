import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, clearTours, toursContainer } from './usersDb';

// #272: select multiple tours in the sidebar and delete them together, from
// across a page boundary, without disturbing the ones left unselected.

buddyTest.describe('multi-select bulk delete', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
    const now = Date.now();
    // 22 tours: PAGE_SIZE is 10, so this spans 3 pages (10/10/2).
    const docs = Array.from({ length: 22 }, (_, i) => ({
      id: `multiselect-tour-${i + 1}`,
      userId: 'local-dev-user',
      name: `MultiSelect Tour ${String(i + 1).padStart(2, '0')}`,
      distance: 10,
      createdAt: new Date(now - i * 60_000).toISOString(),
    }));
    await Promise.all(docs.map((doc) => toursContainer().items.create(doc)));
  });

  buddyTest('selects across a page boundary and deletes only those', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).main.locators.list.count).toHaveText('22');

    await on(page).main.do.enterSelectMode();
    await expect(on(page).main.locators.selection.bar).toBeVisible();
    await expect(on(page).main.locators.selection.count).toHaveText('0 selected');

    // Page 1: sorted newest-first by default (date-desc). Tour 01 was created
    // with the most recent timestamp (i=0 → createdAt = now), so it's first
    // on page 1. Tour 22 has the oldest timestamp (i=21 → now - 21min), so
    // it's the very last item overall — with PAGE_SIZE=10 and 22 tours,
    // that's page 3 (pages are 01-10, 11-20, 21-22).
    await on(page).main.do.toggleTourSelection('MultiSelect Tour 01');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');

    await on(page).main.do.pagerNext();
    await on(page).main.do.pagerNext();
    await on(page).main.do.toggleTourSelection('MultiSelect Tour 22');
    await expect(on(page).main.locators.selection.count).toHaveText('2 selected');

    await on(page).main.do.deleteSelected();

    await expect(on(page).main.locators.list.container).not.toContainText('MultiSelect Tour 01');
    await expect(on(page).main.locators.list.container).not.toContainText('MultiSelect Tour 22');
    await expect(on(page).main.locators.list.count).toHaveText('20');
    // Select mode auto-exits once every selected tour succeeds.
    await expect(on(page).main.locators.selection.bar).toBeHidden();
  });

  buddyTest('cancel exits select mode without deleting anything', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.enterSelectMode();
    // Tour 01 is guaranteed to be on page 1 (see the timestamp comment above).
    await on(page).main.do.toggleTourSelection('MultiSelect Tour 01');
    await expect(on(page).main.locators.selection.count).toHaveText('1 selected');

    await on(page).main.do.cancelSelect();

    await expect(on(page).main.locators.selection.bar).toBeHidden();
    await expect(on(page).main.locators.list.count).toHaveText('22');
  });
});
