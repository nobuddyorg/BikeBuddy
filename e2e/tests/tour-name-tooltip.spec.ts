import { buddyTest, expect } from '../pages/buddy-test';

// #445: a long tour name is ellipsis-truncated in the sidebar with no way to
// read the rest without opening it. highlightedNameNode() now sets `title` to
// the raw name (not the <mark>-wrapped search-highlight markup) so hovering
// reveals it.

const LONG_NAME = 'Tegernsee round trip via Bad Wiessee and back over the hill and down again';

const tour = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'local-dev-user',
  name: LONG_NAME,
  description: '',
  distance: 5,
  createdAt: '2026-07-02T00:00:00.000Z',
  heatmapData: [
    [48.1, 11.5],
    [48.2, 11.6],
  ],
  images: [],
};

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

buddyTest.describe('tour name tooltip', () => {
  buddyTest(
    'a truncated tour name carries the full raw name as its title',
    async ({ on, page }) => {
      await page.route('**/api/me', (route) =>
        route.fulfill(
          json({
            id: 'local-dev-user',
            name: 'Dev',
            email: 'dev@localhost',
            createdAt: '2026-01-01',
          }),
        ),
      );
      await page.route('**/api/map', (route) => route.fulfill(json([])));
      await page.route('**/api/tours', (route) =>
        route.fulfill(
          json([
            {
              id: tour.id,
              name: tour.name,
              description: tour.description,
              distance: tour.distance,
              createdAt: tour.createdAt,
            },
          ]),
        ),
      );

      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      const name = on(page).main.locators.list.names.first();
      await expect(name).toHaveAttribute('title', LONG_NAME);

      // Searching wraps part of the name in <mark> - the tooltip must stay the
      // plain name, not that markup or its rendered text with gaps.
      await on(page).main.do.search('Wiessee');
      await expect(name).toHaveAttribute('title', LONG_NAME);
    },
  );
});
