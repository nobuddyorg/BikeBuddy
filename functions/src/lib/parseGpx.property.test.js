'use strict';

const fc = require('fast-check');
const { parseGpx, InvalidGpxError } = require('./parseGpx');

// A trackpoint as a GPX exporter writes it; elevation and time optional.
const trackpoint = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lon: fc.double({ min: -180, max: 180, noNaN: true }),
  ele: fc.option(fc.double({ min: -500, max: 9000, noNaN: true }), { nil: undefined }),
});

// Timestamps move forward, as a recording does; `shuffledRecording` drops that.
function withTimes(points, { startMs, stepSeconds }) {
  let timestampMs = startMs;
  return points.map((point, index) => {
    if (stepSeconds[index] === undefined) return point;
    timestampMs += stepSeconds[index] * 1000;
    return { ...point, time: new Date(timestampMs).toISOString() };
  });
}

function toGpx(points, name) {
  const trkpts = points
    .map(({ lat, lon, ele, time }) => {
      const eleTag = ele === undefined ? '' : `<ele>${ele}</ele>`;
      const timeTag = time === undefined ? '' : `<time>${time}</time>`;
      return `<trkpt lat="${lat}" lon="${lon}">${eleTag}${timeTag}</trkpt>`;
    })
    .join('');
  const nameTag = name === undefined ? '' : `<name>${name}</name>`;
  return `<?xml version="1.0"?><gpx version="1.1"><trk>${nameTag}<trkseg>${trkpts}</trkseg></trk></gpx>`;
}

const recording = fc
  .tuple(
    fc.array(trackpoint, { minLength: 1, maxLength: 200 }),
    fc.integer({ min: 0, max: 4_000_000_000_000 }),
    fc.array(fc.option(fc.integer({ min: 0, max: 3600 }), { nil: undefined }), {
      maxLength: 200,
    }),
  )
  .map(([points, startMs, stepSeconds]) => withTimes(points, { startMs, stepSeconds }));

// Any timestamps in any order, as a merged or hand-edited file can hold.
const shuffledRecording = fc
  .array(
    fc.tuple(
      trackpoint,
      fc.option(fc.integer({ min: 0, max: 4_000_000_000_000 }), { nil: undefined }),
    ),
    { minLength: 1, maxLength: 200 },
  )
  .map((pairs) =>
    pairs.map(([point, timestampMs]) =>
      timestampMs === undefined ? point : { ...point, time: new Date(timestampMs).toISOString() },
    ),
  );

describe('parseGpx (properties)', () => {
  it('returns finite, non-negative stats for any well-formed recording', () => {
    fc.assert(
      fc.property(recording, (points) => {
        const stats = parseGpx(toGpx(points));
        expect(stats.distanceKm).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(stats.distanceKm)).toBe(true);
        for (const key of ['durationSeconds', 'movingSeconds', 'elevationGain', 'elevationLoss']) {
          if (stats[key] !== null) expect(stats[key]).toBeGreaterThanOrEqual(0);
        }
        if (stats.durationSeconds !== null) {
          expect(stats.movingSeconds).toBeLessThanOrEqual(stats.durationSeconds + 1);
        }
        if (stats.avgSpeed !== null) expect(Number.isFinite(stats.avgSpeed)).toBe(true);
        if (stats.minElevation !== null) {
          expect(stats.minElevation).toBeLessThanOrEqual(stats.maxElevation);
        }
      }),
    );
  });

  it('never reports a negative duration, whatever order the timestamps are in', () => {
    fc.assert(
      fc.property(shuffledRecording, (points) => {
        const stats = parseGpx(toGpx(points));
        if (stats.durationSeconds !== null) expect(stats.durationSeconds).toBeGreaterThanOrEqual(0);
        if (stats.movingSeconds !== null) expect(stats.movingSeconds).toBeGreaterThanOrEqual(0);
        if (stats.date !== null) expect(Number.isFinite(Date.parse(stats.date))).toBe(true);
      }),
    );
  });

  it('keeps an in-order subset of the points, first and last included, within the budget', () => {
    fc.assert(
      fc.property(recording, (points) => {
        const { heatmapData } = parseGpx(toGpx(points));
        // As written to the file, then rounded to five decimals: `${-0}` is "0", so no sign of zero.
        const rounded = (degrees) => Number(Number(String(degrees)).toFixed(5));
        const asWritten = (point) => [rounded(point.lat), rounded(point.lon)];
        expect(heatmapData.length).toBeLessThanOrEqual(Math.min(points.length, 5001));
        expect(heatmapData[0]).toEqual(asWritten(points[0]));
        expect(heatmapData.at(-1)).toEqual(asWritten(points.at(-1)));
      }),
    );
  });

  it('never throws anything but its own validation error on arbitrary text', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: 'binary' })), (text) => {
        try {
          parseGpx(text);
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidGpxError);
          expect(['Not a valid GPX file', 'GPX file has no track points']).toContain(error.message);
        }
      }),
    );
  });

  it('parses a very large track without exhausting the stack', () => {
    fc.assert(
      fc.property(fc.integer({ min: 150_000, max: 200_000 }), (count) => {
        const points = Array.from({ length: count }, (_, index) => ({
          lat: 48 + index * 1e-6,
          lon: 11,
          ele: 500 + (index % 100),
        }));
        const stats = parseGpx(toGpx(points));
        expect(stats.heatmapData.length).toBeLessThanOrEqual(5001);
        expect(stats.minElevation).toBe(500);
        expect(stats.maxElevation).toBe(599);
      }),
      { numRuns: 2 },
    );
  }, 30_000); // two 150k+ point tracks: seconds, not milliseconds, under a parallel run
});
