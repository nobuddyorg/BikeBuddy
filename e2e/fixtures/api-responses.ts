// The static suite's answers to /api/*, in the shapes the handlers project (lib/tourResponse.js et
// al.). No Playwright here: functions/test/unit/e2eMockContract.test.js runs these beside the real
// handlers, so a projection change that the mocks miss fails the unit suite (#574).

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
  /** Where each GPX segment after the first begins in heatmapData (#552). */
  segmentStarts: number[];
  images: MockPhoto[];
}

// A 1x1 transparent PNG: a pin or thumbnail only needs a loadable src.
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

export const DEV_USER = {
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
  segmentStarts: [],
  images: [],
  ...tour,
});

export const mockPhoto = ({ id, lat, lon }: { id: string; lat?: number; lon?: number }) => ({
  id,
  url: PIXEL_PNG,
  thumbUrl: PIXEL_PNG,
  ...(lat !== undefined && lon !== undefined && { lat, lon }),
});

export const listItem = ({ id, name, description, distance, createdAt }: MockTour) => ({
  id,
  name,
  description,
  distance,
  createdAt,
});

export const mapEntry = ({ id, heatmapData, segmentStarts, images }: MockTour) => ({
  id,
  heatmapData,
  segmentStarts,
  images: images.filter((image) => image.lat !== undefined && image.lon !== undefined),
});

export const tourDetail = (tour: MockTour) => ({ ...tour, ...STATS_UNKNOWN });

export const TOUR_NOT_FOUND = { error: 'errors.tourNotFound' };
