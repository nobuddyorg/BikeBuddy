'use strict';

// Deterministic guard (load-testing.md): ~20 km tracks only, longer ones exceed it (#546).
const { connectHarness } = require('./harness');

const TOURS = 60;
const POINTS_PER_TOUR = 2000;
const TRACK_METERS = 20_000;
// GetMapData's TOTAL_POINT_BUDGET plus the slack its 50 m gap rule may add back.
const MAX_POINTS = 110_000;
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
});
