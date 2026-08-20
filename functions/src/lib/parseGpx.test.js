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

// points: [lat, lon, ele?, time?] — ele/time omitted entirely when undefined,
// matching a real GPX exporter that either writes both on every point or
// neither.
function makeGpxWithExtras(points) {
  const trkpts = points
    .map(([lat, lon, ele, time]) => {
      const eleTag = ele !== undefined ? `<ele>${ele}</ele>` : '';
      const timeTag = time !== undefined ? `<time>${time}</time>` : '';
      return `<trkpt lat="${lat}" lon="${lon}">${eleTag}${timeTag}</trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
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

  it('handles a GPX file with no <trk> element at all', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"></gpx>`;
    const result = parseGpx(gpx);
    expect(result.name).toBeNull();
    expect(result.date).toBeNull();
    expect(result.distanceKm).toBe(0);
    expect(result.heatmapData).toEqual([]);
  });

  it('skips trackpoints with missing lat/lon without corrupting distance', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="48" lon="11"/>
    <trkpt/>
    <trkpt lat="49" lon="12"/>
  </trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.heatmapData).toEqual([
      [48, 11],
      [49, 12],
    ]);
    // Same reference value as the two-point great-circle case above: the
    // dropped point must not contribute to (or NaN out) the total.
    expect(result.distanceKm).toBeCloseTo(133.3878, 2);
  });

  it('skips trackpoints with non-numeric lat/lon', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="48" lon="11"/>
    <trkpt lat="not-a-number" lon="11"/>
    <trkpt lat="48" lon=""/>
  </trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.heatmapData).toEqual([[48, 11]]);
    expect(result.distanceKm).toBe(0);
  });

  // Both lat and lon must independently be finite: a point with a valid lat
  // but a non-numeric lon (or vice versa) must still be dropped, not kept
  // because *one* of the two coordinates happened to parse.
  it('drops a point when only one of lat/lon is finite', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="48" lon="not-a-number"/>
    <trkpt lat="not-a-number" lon="11"/>
    <trkpt lat="48" lon="11"/>
  </trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.heatmapData).toEqual([[48, 11]]);
    expect(result.distanceKm).toBe(0);
  });

  it('skips trackpoints with out-of-range coordinates', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="91" lon="11"/>
    <trkpt lat="-91" lon="11"/>
    <trkpt lat="48" lon="181"/>
    <trkpt lat="48" lon="-181"/>
    <trkpt lat="48" lon="11"/>
  </trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.heatmapData).toEqual([[48, 11]]);
    expect(result.distanceKm).toBe(0);
  });

  it('keeps coordinates exactly on the range boundaries', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="90" lon="180"/>
    <trkpt lat="-90" lon="-180"/>
  </trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.heatmapData).toEqual([
      [90, 180],
      [-90, -180],
    ]);
  });

  it('returns zero distance and empty heatmap when every trackpoint is invalid', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg><trkpt/><trkpt lat="abc" lon="def"/></trkseg></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.distanceKm).toBe(0);
    expect(result.heatmapData).toEqual([]);
  });

  it('handles a <trk> with no <trkseg> child at all', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Solo</name></trk>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.name).toBe('Solo');
    expect(result.date).toBeNull();
    expect(result.distanceKm).toBe(0);
    expect(result.heatmapData).toEqual([]);
  });

  describe('elevation stats', () => {
    it('ignores deltas below the 3m noise threshold', () => {
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, 100],
          [48, 11.001, 101],
          [48, 11.002, 99.5],
        ]),
      );
      expect(result.elevationGain).toBe(0);
      expect(result.elevationLoss).toBe(0);
    });

    it('accumulates gain and loss across a mixed profile, resetting the baseline only past the threshold', () => {
      // 100 -> 110 (+10, counted) -> 105 (-5, counted) -> 120 (+15, counted)
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, 100],
          [48, 11.001, 110],
          [48, 11.002, 105],
          [48, 11.003, 120],
        ]),
      );
      expect(result.elevationGain).toBe(25);
      expect(result.elevationLoss).toBe(5);
    });

    it('reports min and max elevation', () => {
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, 50],
          [48, 11.001, 200],
          [48, 11.002, 10],
        ]),
      );
      expect(result.minElevation).toBe(10);
      expect(result.maxElevation).toBe(200);
    });

    it('returns null gain/loss/min/max when no trackpoint has <ele>', () => {
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11],
          [48, 11.001],
        ]),
      );
      expect(result.elevationGain).toBeNull();
      expect(result.elevationLoss).toBeNull();
      expect(result.minElevation).toBeNull();
      expect(result.maxElevation).toBeNull();
    });

    it('reports min/max but not gain/loss for a single elevation point', () => {
      const result = parseGpx(makeGpxWithExtras([[48, 11, 42]]));
      expect(result.minElevation).toBe(42);
      expect(result.maxElevation).toBe(42);
      expect(result.elevationGain).toBeNull();
      expect(result.elevationLoss).toBeNull();
    });
  });

  describe('duration and speed stats', () => {
    it('returns elapsed duration spanning the first to last timestamp', () => {
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, undefined, '2026-01-01T10:00:00Z'],
          [48, 11.01, undefined, '2026-01-01T10:02:00Z'],
        ]),
      );
      expect(result.durationSeconds).toBe(120);
    });

    it('excludes a stop from moving time and average speed', () => {
      // Same 48,11 -> 49,12 pair as the great-circle distance test
      // (133.3878 km), timed to cover that leg in exactly one hour — so
      // avgSpeed (km per hour of moving time) lands on that same reference
      // value without amplifying its rounding.
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, undefined, '2026-01-01T10:00:00Z'],
          [48, 11, undefined, '2026-01-01T10:01:00Z'], // same spot: a 60s stop
          [49, 12, undefined, '2026-01-01T11:01:00Z'], // then a 1h hop
        ]),
      );
      expect(result.durationSeconds).toBe(3660);
      expect(result.movingSeconds).toBe(3600);
      expect(result.avgSpeed).toBeCloseTo(133.3878, 2);
    });

    it('returns null duration/speed when no trackpoint has <time>', () => {
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11],
          [48, 11.001],
        ]),
      );
      expect(result.durationSeconds).toBeNull();
      expect(result.movingSeconds).toBeNull();
      expect(result.avgSpeed).toBeNull();
    });

    it('returns null duration/speed for a single timed point', () => {
      const result = parseGpx(makeGpxWithExtras([[48, 11, undefined, '2026-01-01T10:00:00Z']]));
      expect(result.durationSeconds).toBeNull();
      expect(result.movingSeconds).toBeNull();
      expect(result.avgSpeed).toBeNull();
    });

    it('returns null average speed when every segment is a stop', () => {
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, undefined, '2026-01-01T10:00:00Z'],
          [48, 11, undefined, '2026-01-01T10:01:00Z'],
        ]),
      );
      expect(result.movingSeconds).toBe(0);
      expect(result.avgSpeed).toBeNull();
    });
  });
});
