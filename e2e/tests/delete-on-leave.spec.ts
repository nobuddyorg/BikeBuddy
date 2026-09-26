import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// A delete waits out the Undo window on a timer; a page that goes away first sends it at once
// instead of losing it (#559).

const ALPS = mockTour({ id: '12121212-1212-4121-8121-121212121212', name: 'Alps crossing' });
const LAKE = mockTour({ id: '34343434-3434-4343-8343-343434343434', name: 'Lake loop' });

staticTest.describe('deleting a tour and leaving the page', () => {
  staticTest.use({ mockAccount: { tours: [ALPS, LAKE] } });

  staticTest(
    'sends the delete at once, and a later Undo says it is too late',
    async ({ on, page }) => {
      await page.clock.install();
      await page.goto('/');
      await expect(on(page).list.locators.count).toHaveText('2');
      const deleteRequests: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'DELETE') deleteRequests.push(request.url());
      });

      await on(page).list.row('Alps crossing').do.click();
      await on(page).detail.do.deleteTour();
      await expect(on(page).list.row('Alps crossing')()).toHaveCount(0);
      // The clock stands still: only leaving the page can send it.
      await on(page).main.do.hidePage();
      await expect.poll(() => deleteRequests).toEqual([expect.stringContaining(ALPS.id)]);

      await on(page).main.do.showPage();
      await on(page).main.do.undo();
      await expect(on(page).main.locators.alerts).toContainText('Too late to undo');
      await expect(on(page).list.row('Alps crossing')()).toHaveCount(0);
    },
  );
});

staticTest.describe('deleting a tour another tab already deleted', () => {
  staticTest.use({
    mockAccount: { tours: [ALPS, LAKE] },
    // The 404 is the expected answer, which the browser logs as a console error.
    allowedConsoleErrors: { matching: [/status of 404/] },
  });

  staticTest(
    'counts the 404 as deleted, with no error and no tour brought back',
    async ({ on, page }) => {
      await page.clock.install();
      await page.route(`**/api/tours/${ALPS.id}`, (route) =>
        route.request().method() === 'DELETE'
          ? route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: '{"error":"errors.tourNotFound"}',
            })
          : route.fallback(),
      );
      await page.goto('/');
      await expect(on(page).list.locators.count).toHaveText('2');

      await on(page).list.row('Alps crossing').do.click();
      await on(page).detail.do.deleteTour();
      await page.clock.runFor(10_000);

      await expect(on(page).list.locators.count).toHaveText('1');
      await expect(on(page).main.locators.alerts).toHaveCount(0);
    },
  );
});
