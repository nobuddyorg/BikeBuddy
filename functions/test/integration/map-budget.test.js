'use strict';

// Deterministic guard for GET /api/map (docs/how-to/load-testing.md, "Deterministic
// guards"): with more raw points than the budget, the response is simplified back
// within it, so its size is bounded. Scope: tracks of about 20 km, whose points sit
// closer together than GetMapData's 50 m gap rule. Longer tracks still exceed the
// budget through that rule (#546); raise TRACK_METERS here when #546 is fixed.
const BASE = 'http://localhost:7071/api';
const TOURS = 60;
const POINTS_PER_TOUR = 2000;
const TRACK_METERS = 20_000;
// GetMapData's TOTAL_POINT_BUDGET plus the slack its 50 m gap rule may add back.
const MAX_POINTS = 110_000;
const MAX_BYTES = 4 * 1024 * 1024;

function gpx(index) {
  const stepDegrees = TRACK_METERS / POINTS_PER_TOUR / 111_320;
  const points = [];
  for (let i = 0; i < POINTS_PER_TOUR; i++) {
    // A gentle curve, so simplification has something to drop and something to keep.
    const lat = 47 + index * 0.01 + i * stepDegrees;
    const lon = 10 + Math.sin(i / 200) * 0.01;
    points.push(`<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`);
  }
  return `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${points.join('')}</trkseg></trk></gpx>`;
}

const created = [];

beforeAll(async () => {
  for (let i = 0; i < TOURS; i++) {
    const form = new FormData();
    form.append('file', new Blob([gpx(i)], { type: 'application/gpx+xml' }), 'ride.gpx');
    const res = await fetch(`${BASE}/tours/upload?name=Map%20budget%20${i}`, {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(201);
    created.push((await res.json()).tourId);
  }
}, 180_000);

afterAll(async () => {
  for (const id of created) await fetch(`${BASE}/tours/${id}`, { method: 'DELETE' });
}, 180_000);

describe('GET /api/map budget', () => {
  it('simplifies 120,000 raw points back within the point budget and a bounded size', async () => {
    const res = await fetch(`${BASE}/map`);
    expect(res.status).toBe(200);
    const body = await res.text();
    const tours = JSON.parse(body);

    const points = tours.reduce((total, tour) => total + tour.heatmapData.length, 0);
    expect(points).toBeLessThan(TOURS * POINTS_PER_TOUR);
    expect(points).toBeLessThanOrEqual(MAX_POINTS);
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(MAX_BYTES);
    // Every seeded tour is still on the map, however much it was simplified.
    for (const id of created) expect(tours.some((tour) => tour.id === id)).toBe(true);
  });
});
