import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// 17:30 on 1 July in Los Angeles is already 2 July in UTC.
const RECORDED_AT = '2026-07-02T00:30:00.000Z';

staticTest.use({
  timezoneId: 'America/Los_Angeles',
  mockAccount: {
    tours: [
      mockTour({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Evening Loop',
        createdAt: RECORDED_AT,
      }),
    ],
  },
});

staticTest.describe('editing the date of a tour west of UTC', () => {
  staticTest.beforeEach(async ({ on, page }) => {
    await page.goto('/');
    await on(page).list.row('Evening Loop').do.click();
    await expect(on(page).detail.locators.name).toHaveText('Evening Loop');
  });

  staticTest('shows the local date the detail view shows', async ({ on, page }) => {
    await expect(on(page).detail.locators.date).toHaveText('1 Jul 2026');
    await on(page).detail.do.openEdit();

    await expect(on(page).modal.edit.locators.date).toHaveValue('2026-07-01');
  });

  staticTest('saves the chosen local date at the recorded time of day', async ({ on, page }) => {
    await on(page).detail.do.openEdit();
    await on(page).modal.edit.do.setDate('2026-07-10');

    const patch = page.waitForRequest((request) => request.method() === 'PATCH');
    await on(page).modal.edit.do.submit();

    expect((await patch).postDataJSON()).toMatchObject({ createdAt: '2026-07-11T00:30:00.000Z' });
  });
});
