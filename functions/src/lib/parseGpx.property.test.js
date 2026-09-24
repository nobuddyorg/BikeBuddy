'use strict';

const fc = require('fast-check');
const { parseGpx } = require('./parseGpx');

// A trackpoint as a GPX exporter writes it; elevation and time optional.
const trackpoint = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lon: fc.double({ min: -180, max: 180, noNaN: true }),
  ele: fc.option(fc.double({ min: -500, max: 9000, noNaN: true }), { nil: undefined }),
});

// Timestamps only move forward, as a recording does (out-of-order times are
// #575's open question, not a property yet).
function withTimes(points, startMs, stepsSec) {
  let t = startMs;
  return points.map((p, i) => {
    if (stepsSec[i] === undefined) return p;
    t += stepsSec[i] * 1000;
    return { ...p, time: new Date(t).toISOString() };
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
    fc.array(trackpoint, { maxLength: 200 }),
    fc.integer({ min: 0, max: 4_000_000_000_000 }),
    fc.array(fc.option(fc.integer({ min: 0, max: 3600 }), { nil: undefined }), {
      maxLength: 200,
    }),
  )
  .map(([points, start, steps]) => withTimes(points, start, steps));

describe('parseGpx (properties)', () => {
  it('returns finite, non-negative stats for any well-formed recording', () => {
    fc.assert(
      fc.property(recording, (points) => {
        const r = parseGpx(toGpx(points));
        expect(r.distanceKm).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(r.distanceKm)).toBe(true);
        for (const key of ['durationSeconds', 'movingSeconds', 'elevationGain', 'elevationLoss']) {
          if (r[key] !== null) expect(r[key]).toBeGreaterThanOrEqual(0);
        }
        if (r.durationSeconds !== null) {
          expect(r.movingSeconds).toBeLessThanOrEqual(r.durationSeconds + 1);
        }
        if (r.avgSpeed !== null) expect(Number.isFinite(r.avgSpeed)).toBe(true);
        if (r.minElevation !== null) expect(r.minElevation).toBeLessThanOrEqual(r.maxElevation);
      }),
    );
  });

  it('keeps an in-order subset of the points, first and last included, within the budget', () => {
    fc.assert(
      fc.property(recording, (points) => {
        const { heatmapData } = parseGpx(toGpx(points));
        // As written to the file: `${-0}` is "0", so the sign of zero does not survive.
        const asWritten = (p) => [Number(String(p.lat)), Number(String(p.lon))];
        expect(heatmapData.length).toBeLessThanOrEqual(Math.min(points.length, 5001));
        if (points.length > 0) {
          expect(heatmapData[0]).toEqual(asWritten(points[0]));
          expect(heatmapData.at(-1)).toEqual(asWritten(points.at(-1)));
        }
      }),
    );
  });

  it('never throws anything but its own validation error on arbitrary text', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: 'binary' })), (text) => {
        try {
          parseGpx(text);
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          expect(err.message).toBe('Not a valid GPX file');
        }
      }),
    );
  });

  it('parses a very large track without exhausting the stack (#575)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 150_000, max: 200_000 }), (count) => {
        const points = Array.from({ length: count }, (_, i) => ({
          lat: 48 + i * 1e-6,
          lon: 11,
          ele: 500 + (i % 100),
        }));
        const r = parseGpx(toGpx(points));
        expect(r.heatmapData.length).toBeLessThanOrEqual(5001);
        expect(r.minElevation).toBe(500);
        expect(r.maxElevation).toBe(599);
      }),
      { numRuns: 2 },
    );
  }, 30_000); // two 150k+ point tracks: seconds, not milliseconds, under a parallel run
});
