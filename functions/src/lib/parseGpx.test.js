'use strict';

const { parseGpx, InvalidGpxError, NoTrackPointsError } = require('./parseGpx');

const TWO_POINTS = [
  [48.1351, 11.582],
  [48.1361, 11.583],
];

function makeGpx({ name = 'Test Tour', time = '2024-06-01T10:00:00Z', points = TWO_POINTS } = {}) {
  const trackPoints = points
    .map(([latitude, longitude]) => `<trkpt lat="${latitude}" lon="${longitude}"/>`)
    .join('\n');
  return `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><time>${time}</time></metadata>
  <trk><trkseg>${trackPoints}</trkseg></trk>
</gpx>`;
}

// points: [latitude, longitude, elevation?, time?]; a missing value writes no tag.
function makeGpxWithExtras(points) {
  const trackPoints = points
    .map(([latitude, longitude, elevation, time]) => {
      const elevationTag = elevation === undefined ? '' : `<ele>${elevation}</ele>`;
      const timeTag = time === undefined ? '' : `<time>${time}</time>`;
      return `<trkpt lat="${latitude}" lon="${longitude}">${elevationTag}${timeTag}</trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>${trackPoints}</trkseg></trk>
</gpx>`;
}

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
    const points = Array.from({ length: 6000 }, (_, index) => [48 + index * 0.0001, 11]);
    const result = parseGpx(makeGpx({ points }));
    expect(result.heatmapData.length).toBeLessThanOrEqual(5000);
    // Every second point (3000) plus the last one, which sits at an odd index.
    expect(result.heatmapData).toHaveLength(3001);
    expect(result.heatmapData[0]).toEqual(points[0]);
    expect(result.heatmapData[result.heatmapData.length - 1]).toEqual(points[points.length - 1]);
  });

  it('handles a single trackpoint without crashing', () => {
    const result = parseGpx(makeGpx({ points: [[48.0, 11.0]] }));
    expect(result.heatmapData).toHaveLength(1);
    expect(result.distanceKm).toBe(0);
  });

  it('throws on non-GPX XML', () => {
    expect(() => parseGpx('<foo><bar/></foo>')).toThrow(InvalidGpxError);
    expect(() => parseGpx('<foo><bar/></foo>')).toThrow('Not a valid GPX file');
  });

  it('keeps every point of a track with exactly 5000 points', () => {
    const points = Array.from({ length: 5000 }, (_, index) => [48 + index * 0.0001, 11]);
    expect(parseGpx(makeGpx({ points })).heatmapData).toHaveLength(5000);
  });

  it('parses a Buffer the same as a string', () => {
    const text = makeGpx({ points: TWO_POINTS });
    expect(parseGpx(Buffer.from(text, 'utf8'))).toEqual(parseGpx(text));
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
    // Only the first track's leg: a lone point in the second track adds no distance.
    expect(result.distanceKm).toBeCloseTo(0.744, 3);
  });

  it.each([
    ['no track at all', ''],
    ['a track without segments', '<trk><name>Solo</name></trk>'],
    ['an empty segment', '<trk><trkseg></trkseg></trk>'],
    ['only invalid points', '<trk><trkseg><trkpt/><trkpt lat="abc" lon="def"/></trkseg></trk>'],
    ['only waypoints', '<wpt lat="48" lon="11"/>'],
    ['only invalid route points', '<rte><rtept lat="abc" lon="11"/></rte><rte/>'],
  ])('throws NoTrackPointsError for a file with %s (#554)', (_label, body) => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
    expect(() => parseGpx(gpx)).toThrow(NoTrackPointsError);
  });

  it.each(['<gpx/>', '<gpx>text</gpx>'])('throws NoTrackPointsError for %s', (gpx) => {
    expect(() => parseGpx(gpx)).toThrow(NoTrackPointsError);
  });

  it('reports no track points as an invalid GPX file', () => {
    const error = new NoTrackPointsError();
    expect(error).toBeInstanceOf(InvalidGpxError);
    expect(error.name).toBe('NoTrackPointsError');
    expect(error.message).toBe('GPX file has no track points');
  });

  it('reads the points of a route-only file, one line per route (#554)', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte><name>Planned</name><rtept lat="48" lon="11"/><rtept lat="49" lon="12"/></rte>
  <rte><rtept lat="50" lon="12"/><rtept lat="abc" lon="12"/></rte>
  <rte><rtept/></rte>
</gpx>`;
    const result = parseGpx(gpx);
    expect(result.heatmapData).toEqual([
      [48, 11],
      [49, 12],
      [50, 12],
    ]);
    expect(result.distanceKm).toBeCloseTo(133.3878, 2);
  });

  it('ignores the routes of a file that also holds a track', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte><rtept lat="10" lon="10"/><rtept lat="11" lon="11"/></rte>
  <trk><trkseg><trkpt lat="48" lon="11"/><trkpt lat="49" lon="12"/></trkseg></trk>
</gpx>`;
    expect(parseGpx(gpx).heatmapData).toEqual([
      [48, 11],
      [49, 12],
    ]);
  });

  describe('gaps between segments (#552)', () => {
    // Two rides a day apart, Munich area then Berlin: the train between them is not riding.
    const TWO_RIDES = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="48" lon="11"><ele>500</ele><time>2026-01-01T10:00:00Z</time></trkpt>
      <trkpt lat="49" lon="12"><ele>510</ele><time>2026-01-01T12:00:00Z</time></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="52" lon="13"><ele>40</ele><time>2026-01-02T10:00:00Z</time></trkpt>
      <trkpt lat="52" lon="13.01"><ele>60</ele><time>2026-01-02T10:02:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;
    const SECOND_SEGMENT_KM = 0.6846;

    it('adds up distance within each segment, never across the gap', () => {
      expect(parseGpx(TWO_RIDES).distanceKm).toBeCloseTo(133.3878 + SECOND_SEGMENT_KM, 3);
    });

    it('counts only the ridden legs as moving time, and elapsed from first to last', () => {
      const result = parseGpx(TWO_RIDES);
      expect(result.movingSeconds).toBe(7200 + 120);
      expect(result.durationSeconds).toBe(24 * 3600 + 120);
      expect(result.avgSpeed).toBeCloseTo((133.3878 + SECOND_SEGMENT_KM) / (7320 / 3600), 2);
    });

    it('counts the climb within each segment, not the drop between them', () => {
      const result = parseGpx(TWO_RIDES);
      expect(result.elevationGain).toBe(30);
      expect(result.elevationLoss).toBe(0);
      expect(result.minElevation).toBe(40);
      expect(result.maxElevation).toBe(510);
    });

    it('treats each <trk> as its own line too', () => {
      const split = TWO_RIDES.replace(
        '</trkseg>\n    <trkseg>',
        '</trkseg>\n  </trk>\n  <trk>\n    <trkseg>',
      );
      expect(split).not.toBe(TWO_RIDES);
      expect(parseGpx(split)).toEqual(parseGpx(TWO_RIDES));
    });
  });

  it.each([
    ['a numeric name as text (#548)', '<name>20240512</name>', '20240512'],
    ['the text of a name with attributes', '<name lang="de">Isartal</name>', 'Isartal'],
    ['decoded entities', '<name>Ride &amp; Coffee</name>', 'Ride & Coffee'],
    ['null for a name with only child elements', '<name><b>x</b></name>', null],
  ])('returns %s', (_label, nameTag, expected) => {
    const gpx = `<gpx><metadata>${nameTag}</metadata><trk><trkseg><trkpt lat="48" lon="11"/></trkseg></trk></gpx>`;
    expect(parseGpx(gpx).name).toBe(expected);
  });

  it('falls back to the earliest point time when the metadata time is unreadable (#575)', () => {
    const gpx = `<gpx><metadata><time>not a date</time></metadata><trk><trkseg>
      <trkpt lat="48" lon="11"><time>2026-01-01T10:05:00Z</time></trkpt>
      <trkpt lat="48" lon="11.01"><time>2026-01-01T10:00:00Z</time></trkpt>
      <trkpt lat="48" lon="11.02"><time>garbage</time></trkpt>
    </trkseg></trk></gpx>`;
    expect(parseGpx(gpx).date).toBe('2026-01-01T10:00:00.000Z');
  });

  it('takes the date from a valid point when the first point is invalid', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="abc" lon="11"><time>2020-01-01T00:00:00Z</time></trkpt>
      <trkpt lat="48" lon="11"><time>2026-01-01T10:00:00Z</time></trkpt>
    </trkseg></trk></gpx>`;
    expect(parseGpx(gpx).date).toBe('2026-01-01T10:00:00.000Z');
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
    // Same reference value as the great-circle case: the dropped point adds nothing.
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

    it('counts a delta of exactly the 3m threshold', () => {
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, 100],
          [48, 11.001, 103],
          [48, 11.002, 100],
        ]),
      );
      expect(result.elevationGain).toBe(3);
      expect(result.elevationLoss).toBe(3);
    });

    it('accumulates gain and loss across a mixed profile, resetting the baseline only past the threshold', () => {
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

  // Shrunk counterexamples from parseGpx.property.test.js, kept as examples.
  describe('property-test regressions', () => {
    it('reports malformed markup as an invalid GPX file, keeping the parser error as its cause', () => {
      let thrown;
      try {
        parseGpx('<');
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(InvalidGpxError);
      expect(thrown.name).toBe('InvalidGpxError');
      expect(thrown.message).toBe('Not a valid GPX file');
      expect(thrown.cause).toBeInstanceOf(Error);
    });

    it('computes min/max elevation of a 150,000-point track without a stack overflow (#575)', () => {
      const points = Array.from({ length: 150_000 }, (_, index) => [
        48 + index * 1e-6,
        11,
        500 + (index % 100),
      ]);
      const result = parseGpx(makeGpxWithExtras(points));
      expect(result.minElevation).toBe(500);
      expect(result.maxElevation).toBe(599);
    }, 30_000); // a 150,000-point document takes seconds to build and parse
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
      // The 133.3878 km great-circle leg, ridden in two hours after a 60 s stop.
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, undefined, '2026-01-01T10:00:00Z'],
          [48, 11, undefined, '2026-01-01T10:01:00Z'],
          [49, 12, undefined, '2026-01-01T12:01:00Z'],
        ]),
      );
      expect(result.durationSeconds).toBe(7260);
      expect(result.movingSeconds).toBe(7200);
      expect(result.avgSpeed).toBeCloseTo(133.3878 / 2, 2);
    });

    it('never reports a negative duration for timestamps out of file order (#575)', () => {
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, undefined, '2026-01-01T12:00:00Z'],
          [48, 11.01, undefined, '2026-01-01T10:00:00Z'],
          [48, 11.02, undefined, '2026-01-01T11:00:00Z'],
        ]),
      );
      expect(result.durationSeconds).toBe(7200);
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

    it('skips a segment whose timestamp does not advance (no infinite speed)', () => {
      const result = parseGpx(
        makeGpxWithExtras([
          [48, 11, undefined, '2026-01-01T10:00:00Z'],
          [49, 12, undefined, '2026-01-01T10:00:00Z'],
          [49, 12.001, undefined, '2026-01-01T10:00:10Z'],
        ]),
      );
      expect(result.durationSeconds).toBe(10);
      expect(result.movingSeconds).toBe(10);
      // Only the last 73 m leg counts: 73 m in 10 s is about 26.3 km/h.
      expect(result.avgSpeed).toBeCloseTo(26.3, 0);
    });

    it('counts a leg at exactly the 1 km/h floor as moving', () => {
      // 1 km exactly (as the parser computes it) in one hour.
      const result = parseGpx(
        makeGpxWithExtras([
          [0, 0, undefined, '2026-01-01T10:00:00Z'],
          [0, 0.008993216059187308, undefined, '2026-01-01T11:00:00Z'],
        ]),
      );
      expect(result.movingSeconds).toBe(3600);
      expect(result.avgSpeed).toBe(1);
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
