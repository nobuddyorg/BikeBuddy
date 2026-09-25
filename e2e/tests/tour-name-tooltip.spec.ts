import { expect, mockTour, staticTest } from '../fixtures/api-mocks';

// A long name is ellipsis-truncated in the sidebar; hovering reveals it through the title.

const LONG_NAME = 'Tegernsee round trip via Bad Wiessee and back over the hill and down again';

staticTest.use({
  mockAccount: {
    tours: [mockTour({ id: '11111111-1111-4111-8111-111111111111', name: LONG_NAME })],
  },
});

staticTest('a truncated tour name carries the full raw name as its title', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();

  const name = on(page).list.row(LONG_NAME).locators.name;
  await expect(name).toHaveAttribute('title', LONG_NAME);

  // Searching wraps part of the name in <mark>: the tooltip must stay the plain name.
  await on(page).list.do.search('Wiessee');
  await expect(name).toHaveAttribute('title', LONG_NAME);
});
