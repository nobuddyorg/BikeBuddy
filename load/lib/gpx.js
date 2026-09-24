// Deterministic GPX tracks: the same index gives the same file, so two runs
// seed the same data and their numbers compare.

// mulberry32: a small seeded PRNG.
function rng(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A ride of `points` trackpoints, 5 s apart, with elevation, around the Alps. */
export function gpxTrack(index, points) {
  const random = rng(index + 1);
  let lat = 46.5 + random() * 2;
  let lon = 9.5 + random() * 4;
  let ele = 400 + random() * 1200;
  const start = Date.UTC(2024, index % 12, 1 + (index % 27), 7);
  const parts = [];
  for (let i = 0; i < points; i++) {
    lat += (random() - 0.45) * 0.0005;
    lon += (random() - 0.4) * 0.0007;
    ele += (random() - 0.5) * 3;
    const time = new Date(start + i * 5000).toISOString();
    parts.push(
      `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele><time>${time}</time></trkpt>`,
    );
  }
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${parts.join('')}</trkseg></trk></gpx>`;
}

// The sizes a run uploads: a typical ride, a long day, and (stress) a multi-day
// recording that exercises the 5,000-point downsampling and the parser's limits.
export const SIZES = { typical: 2000, long: 10000, huge: 100000 };
