'use strict';

const { parseGpx } = require('./parseGpx');

function makeGpx({ name = 'Test Tour', time = '2024-06-01T10:00:00Z', points = [] } = {}) {
  const trkpts = points.map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"/>`).join('\n');
  return `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><time>${time}</time></metadata>
  <trk><trkseg>${trkpts}</trkseg></trk>
</gpx>`;
}

const TWO_POINTS = [
  [48.1351, 11.582],
  [48.1361, 11.583],
];

describe('parseGpx', () => {
  it('extracts name and date from metadata', () => {
    const result = parseGpx(makeGpx({ name: 'Alpine Run', time: '2024-07-15T08:00:00Z' }));
    expect(result.name).toBe('Alpine Run');
    expect(result.date).toBe('2024-07-15T08:00:00.000Z');
  });

  it('computes a positive distance for two close points', () => {
    const result = parseGpx(makeGpx({ points: TWO_POINTS }));
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.distanceKm).toBeLessThan(5);
  });

  it('computes the exact great-circle distance (lat and lon both vary)', () => {
    // 48,11 -> 49,12: every term of the Haversine formula contributes.
    // Reference value from an independent computation: 133.3878 km.
    const result = parseGpx(
      makeGpx({
        points: [
          [48, 11],
          [49, 12],
        ],
      }),
    );
    expect(result.distanceKm).toBeCloseTo(133.3878, 2);
  });

  it('returns heatmapData as [[lat, lon]] pairs', () => {
    const result = parseGpx(makeGpx({ points: TWO_POINTS }));
    expect(result.heatmapData).toEqual(TWO_POINTS);
  });

  it('downsamples when points exceed 5000', () => {
    // 6000 points along a horizontal line
    const points = Array.from({ length: 6000 }, (_, i) => [48 + i * 0.0001, 11]);
    const result = parseGpx(makeGpx({ points }));
    expect(result.heatmapData.length).toBeLessThanOrEqual(5000);
    // step = ceil(6000 / 5000) = 2 → every 2nd point (3000) plus the last (odd index).
    expect(result.heatmapData).toHaveLength(3001);
    // first and last are preserved
    expect(result.heatmapData[0]).toEqual(points[0]);
    expect(result.heatmapData[result.heatmapData.length - 1]).toEqual(points[points.length - 1]);
  });

  it('handles a single trackpoint without crashing', () => {
    const result = parseGpx(makeGpx({ points: [[48.0, 11.0]] }));
    expect(result.heatmapData).toHaveLength(1);
    expect(result.distanceKm).toBe(0);
  });

  it('throws on non-GPX XML', () => {
    expect(() => parseGpx('<foo><bar/></foo>')).toThrow('Not a valid GPX file');
  });

  it('returns null name and date when metadata is absent', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg><trkpt lat="48.0" lon="11.0"/></trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.name).toBeNull();
    expect(result.date).toBeNull();
  });

  it('falls back to track name and first trackpoint time when metadata is absent', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Fallback Trail</name><trkseg>
    <trkpt lat="48.0" lon="11.0"><time>2025-03-02T06:00:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.name).toBe('Fallback Trail');
    expect(result.date).toBe('2025-03-02T06:00:00.000Z');
  });

  it('aggregates points across multiple tracks and segments in order', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="48.0" lon="11.00"/>
    <trkpt lat="48.0" lon="11.01"/>
  </trkseg></trk>
  <trk><trkseg>
    <trkpt lat="48.0" lon="11.02"/>
  </trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.heatmapData).toEqual([
      [48.0, 11.0],
      [48.0, 11.01],
      [48.0, 11.02],
    ]);
    expect(result.distanceKm).toBeGreaterThan(0);
  });

  it('returns zero distance and empty heatmap when there are no trackpoints', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg></trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.distanceKm).toBe(0);
    expect(result.heatmapData).toEqual([]);
  });
});
