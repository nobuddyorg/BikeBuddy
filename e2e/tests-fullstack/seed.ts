import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext, APIResponse } from '@playwright/test';

// Seeding goes through the API as the user, so every seeded tour and photo is one the
// handlers produced: a real id, a stored GPX, and photo blobs behind every image entry.

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

/** JPEG fixtures: one without EXIF, two with an EXIF GPS position (latitude, longitude). */
export const PHOTOS = {
  untagged: fixture('sample.jpg'),
  at48_1_11_5: fixture('photo-gps-48.1-11.5.jpg'),
  at48_12_11_55: fixture('photo-gps-48.12-11.55.jpg'),
};

interface SeedTour {
  name: string;
  /** The ride's start (GPX metadata time), which becomes the tour's date and list order. */
  time: string;
  /** Track points as [latitude, longitude]; none gives a tour without a track. */
  points?: [number, number][];
}

export interface Seeder {
  /** Uploads a GPX track; returns the new tour's id. */
  tour(tour: SeedTour): Promise<string>;
  /** Uploads a photo fixture (PHOTOS) to a tour. */
  photo(photo: { tourId: string; path: string }): Promise<void>;
}

const gpx = ({ time, points = [] }: SeedTour) =>
  '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">' +
  `<metadata><time>${time}</time></metadata><trk><trkseg>` +
  points.map(([latitude, longitude]) => `<trkpt lat="${latitude}" lon="${longitude}"/>`).join('') +
  '</trkseg></trk></gpx>';

async function expectCreated(response: APIResponse, what: string) {
  if (response.status() !== 201) {
    throw new Error(`seeding ${what} failed: HTTP ${response.status()} ${await response.text()}`);
  }
}

export function createSeeder(request: APIRequestContext): Seeder {
  return {
    tour: async (tour) => {
      const response = await request.post(
        `/api/tours/upload?name=${encodeURIComponent(tour.name)}`,
        {
          multipart: {
            file: {
              name: 'ride.gpx',
              mimeType: 'application/gpx+xml',
              buffer: Buffer.from(gpx(tour)),
            },
          },
        },
      );
      await expectCreated(response, `tour "${tour.name}"`);
      const { tourId } = (await response.json()) as { tourId: string };
      return tourId;
    },
    photo: async ({ tourId, path }) => {
      const response = await request.post(`/api/tours/${tourId}/images`, {
        multipart: {
          file: { name: basename(path), mimeType: 'image/jpeg', buffer: readFileSync(path) },
        },
      });
      await expectCreated(response, `photo ${basename(path)}`);
    },
  };
}
