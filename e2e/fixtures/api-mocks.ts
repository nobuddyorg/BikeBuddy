import type { Page, Route } from '@playwright/test';
import { buddyTest } from '../pages/buddy-test';

// Every /api/* call, answered in the shapes the handlers project (lib/tourResponse.js et al.).

interface MockPhoto {
  id: string;
  url: string;
  thumbUrl: string;
  lat?: number;
  lon?: number;
}

export interface MockTour {
  id: string;
  name: string;
  description: string;
  distance: number;
  createdAt: string;
  heatmapData: [number, number][];
  images: MockPhoto[];
}

// A 1x1 transparent PNG: a pin or thumbnail only needs a loadable src.
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const DEV_USER = {
  id: 'local-dev-user',
  name: 'Local Dev',
  email: 'dev@localhost',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const STATS_UNKNOWN = {
  elevationGain: null,
  elevationLoss: null,
  minElevation: null,
  maxElevation: null,
  durationSeconds: null,
  movingSeconds: null,
  avgSpeed: null,
};

export const mockTour = (tour: Pick<MockTour, 'id' | 'name'> & Partial<MockTour>): MockTour => ({
  description: '',
  distance: 5,
  createdAt: '2026-07-01T00:00:00.000Z',
  heatmapData: [],
  images: [],
  ...tour,
});

export const mockPhoto = ({ id, lat, lon }: { id: string; lat: number; lon: number }) => ({
  id,
  url: PIXEL_PNG,
  thumbUrl: PIXEL_PNG,
  lat,
  lon,
});

const listItem = ({ id, name, description, distance, createdAt }: MockTour) => ({
  id,
  name,
  description,
  distance,
  createdAt,
});

const mapEntry = ({ id, heatmapData, images }: MockTour) => ({
  id,
  heatmapData,
  images: images.filter((image) => image.lat !== undefined && image.lon !== undefined),
});

const tourDetail = (tour: MockTour) => ({ ...tour, ...STATS_UNKNOWN });

const json = (route: Route, { status = 200, body }: { status?: number; body: unknown }) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockApi(page: Page, tours: MockTour[]) {
  await page.route('**/api/me', (route) => json(route, { body: DEV_USER }));
  await page.route('**/api/map', (route) => json(route, { body: tours.map(mapEntry) }));
  await page.route('**/api/tours', (route) => json(route, { body: tours.map(listItem) }));
  await page.route('**/api/tours/*', (route) => {
    const tourId = new URL(route.request().url()).pathname.split('/').pop();
    const tour = tours.find((candidate) => candidate.id === tourId);
    if (!tour) return json(route, { status: 404, body: { error: 'errors.tourNotFound' } });
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
