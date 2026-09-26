'use strict';

// Deterministic guard (load-testing.md): 100 km tracks, 50 m apart, which a gap rule could not merge (#546).
const { connectHarness } = require('./harness');

const TOURS = 60;
const POINTS_PER_TOUR = 2000;
const TRACK_METERS = 100_000;
// GetMapData's TOTAL_POINT_BUDGET, a hard cap.
const MAX_POINTS = 100_000;
const MAX_BYTES = 4 * 1024 * 1024;

function gpx(index) {
  const stepDegrees = TRACK_METERS / POINTS_PER_TOUR / 111_320;
  const points = [];
  for (let point = 0; point < POINTS_PER_TOUR; point++) {
    // A gentle curve, so simplification has something to drop and something to keep.
    const latitude = 47 + index * 0.01 + point * stepDegrees;
    const longitude = 10 + Math.sin(point / 200) * 0.01;
    points.push(`<trkpt lat="${latitude.toFixed(6)}" lon="${longitude.toFixed(6)}"/>`);
  }
  return `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${points.join('')}</trkseg></trk></gpx>`;
}

const created = [];
let rider;

beforeAll(async () => {
  rider = (await connectHarness()).newUser();
  for (let index = 0; index < TOURS; index++) {
    created.push(await rider.api.createTour({ name: `Map budget ${index}`, gpx: gpx(index) }));
  }
}, 180_000);

afterAll(async () => {
  await rider?.api.deleteAccount();
}, 180_000);

describe('GET /api/map budget', () => {
  it('simplifies 120,000 raw points back within the point budget and a bounded size', async () => {
    const response = await rider.api.request('/map');
    expect(response.status).toBe(200);
    const body = await response.text();
    const tours = JSON.parse(body);

    const points = tours.reduce((total, tour) => total + tour.heatmapData.length, 0);
    expect(points).toBeLessThan(TOURS * POINTS_PER_TOUR);
    expect(points).toBeLessThanOrEqual(MAX_POINTS);
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(MAX_BYTES);
    // Every seeded tour is still on the map, however much it was simplified.
    expect(tours.map((tour) => tour.id).sort()).toEqual([...created].sort());
  });

  // Through the real host: it must pass the worker's encoding on untouched (#578).
  it.each([
    ['br', 'br'],
    ['gzip', 'gzip'],
    ['identity', null],
  ])('answers Accept-Encoding %s with Content-Encoding %s', async (accepted, coding) => {
    const response = await rider.api.request('/map', { headers: { 'Accept-Encoding': accepted } });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBe(coding);
    expect(response.headers.get('vary')).toMatch(/accept-encoding/i);
    // fetch decodes the body, so it reads as the same map either way.
    expect((await response.json()).map((tour) => tour.id).sort()).toEqual([...created].sort());
  });
});
