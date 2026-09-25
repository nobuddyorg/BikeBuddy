import { expect, fullstackTest } from './fullstack-test';

// Eleven tours over a page size of ten: Tour 01 (newest) leads page 1, Tour 11 is alone on page 2.
const TOUR_COUNT = 11;
const tourName = (number: number) => `MultiSelect Tour ${String(number).padStart(2, '0')}`;

fullstackTest.describe('multi-select bulk delete', () => {
  fullstackTest.beforeEach(async ({ seed }) => {
    for (let number = 1; number <= TOUR_COUNT; number++) {
      const day = String(TOUR_COUNT + 1 - number).padStart(2, '0');
      await seed.tour({ name: tourName(number), time: `2026-06-${day}T08:00:00Z` });
    }
  });

  fullstackTest('selects across a page boundary and deletes only those', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await expect(on(page).list.locators.count).toHaveText('11');

    await on(page).list.do.enterSelectMode();
    await expect(on(page).list.locators.selection.bar).toBeVisible();
    await expect(on(page).list.locators.selection.count).toHaveText('0 selected');

    await on(page).list.row(tourName(1)).do.click();
    await expect(on(page).list.locators.selection.count).toHaveText('1 selected');

    await on(page).list.do.nextPage();
    await on(page).list.row(tourName(11)).do.click();
    await expect(on(page).list.locators.selection.count).toHaveText('2 selected');

    await on(page).list.do.deleteSelected();

    await expect(on(page).list.locators.count).toHaveText('9');
    await expect(on(page).list.row(tourName(1))()).toHaveCount(0);
    await expect(on(page).list.row(tourName(11))()).toHaveCount(0);
    // Select mode auto-exits once every selected tour succeeds.
    await expect(on(page).list.locators.selection.bar).toBeHidden();
  });

  fullstackTest('cancel exits select mode without deleting anything', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).list.do.enterSelectMode();
    await on(page).list.row(tourName(1)).do.click();
    await expect(on(page).list.locators.selection.count).toHaveText('1 selected');

    await on(page).list.do.cancelSelect();

    await expect(on(page).list.locators.selection.bar).toBeHidden();
    await expect(on(page).list.locators.count).toHaveText('11');
  });
});
