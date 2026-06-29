'use strict';

const BASE = 'http://localhost:7071/api';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Integration Tour</name><time>2026-06-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
    <trkpt lat="48.1371" lon="11.5840"/>
  </trkseg></trk>
</gpx>`;

async function uploadTour(name) {
  const form = new FormData();
  form.append('file', new Blob([GPX], { type: 'application/gpx+xml' }), 'ride.gpx');
  return fetch(`${BASE}/tours/upload?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    body: form,
  });
}

describe('tours HTTP lifecycle', () => {
  it('uploads → lists → reads → deletes a tour', async () => {
    const name = `Integration ${Date.now()}`;

    const up = await uploadTour(name);
    expect(up.status).toBe(201);
    const created = await up.json();
    expect(created.tourId).toBeTruthy();
    expect(created.name).toBe(name);

    const list = await fetch(`${BASE}/tours`);
    expect(list.status).toBe(200);
    const tours = await list.json();
    expect(Array.isArray(tours)).toBe(true);
    expect(tours.some((t) => t.id === created.tourId)).toBe(true);
    // List payloads stay small — heatmapData is detail-only.
    expect(tours.every((t) => t.heatmapData === undefined)).toBe(true);

    const detail = await fetch(`${BASE}/tours/${created.tourId}`);
    expect(detail.status).toBe(200);
    const tour = await detail.json();
    expect(tour.name).toBe(name);
    expect(Array.isArray(tour.heatmapData)).toBe(true);
    expect(tour.heatmapData.length).toBeGreaterThan(0);

    const del = await fetch(`${BASE}/tours/${created.tourId}`, { method: 'DELETE' });
    expect(del.status).toBe(204);

    const gone = await fetch(`${BASE}/tours/${created.tourId}`);
    expect(gone.status).toBe(404);
  });

  it('rejects a non-UUID tour id with 400', async () => {
    const res = await fetch(`${BASE}/tours/not-a-uuid`);
    expect(res.status).toBe(400);
  });

  it('rejects a non-GPX upload with 400', async () => {
    const form = new FormData();
    form.append('file', new Blob(['not xml at all'], { type: 'text/plain' }), 'notes.txt');
    const res = await fetch(`${BASE}/tours/upload?name=Bad`, { method: 'POST', body: form });
    expect(res.status).toBe(400);
  });
});
