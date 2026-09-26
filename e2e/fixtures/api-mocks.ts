import type { Page, Route } from '@playwright/test';
import { buddyTest } from '../pages/buddy-test';

import {
  DEV_USER,
  TOUR_NOT_FOUND,
  listItem,
  mapEntry,
  tourDetail,
  type MockTour,
} from './api-responses';

export { mockPhoto, mockTour } from './api-responses';

const json = (route: Route, { status = 200, body }: { status?: number; body: unknown }) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockApi(page: Page, tours: MockTour[]) {
  await page.route('**/api/v1/me', (route) => json(route, { body: DEV_USER }));
  await page.route('**/api/v1/map', (route) => json(route, { body: tours.map(mapEntry) }));
  await page.route('**/api/v1/tours', (route) => json(route, { body: tours.map(listItem) }));
  await page.route('**/api/v1/tours/*', (route) => {
    const tourId = new URL(route.request().url()).pathname.split('/').pop();
    const tour = tours.find((candidate) => candidate.id === tourId);
    if (!tour) return json(route, { status: 404, body: TOUR_NOT_FOUND });
    return json(route, { body: tourDetail(tour) });
  });
}

// An object, not a bare array: test.use() would read an array as [value, options].
export const staticTest = buddyTest.extend<{ mockAccount: { tours: MockTour[] }; mockedApi: void }>(
  {
    mockAccount: [{ tours: [] }, { option: true }],
    mockedApi: [
      async ({ page, mockAccount }, use) => {
        await mockApi(page, mockAccount.tours);
        await use();
      },
      { auto: true },
    ],
  },
);

export { expect } from '@playwright/test';
