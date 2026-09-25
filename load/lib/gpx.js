// Deterministic: the same index gives the same file, so two runs seed the same data and compare.

// mulberry32, a small seeded pseudo-random generator.
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A ride of `points` trackpoints, 5 s apart, with elevation, around the Alps. */
export function gpxTrack(index, points) {
  const random = seededRandom(index + 1);
  let latitude = 46.5 + random() * 2;
  let longitude = 9.5 + random() * 4;
  let elevation = 400 + random() * 1200;
  const start = Date.UTC(2024, index % 12, 1 + (index % 27), 7);
  const parts = [];
  for (let point = 0; point < points; point++) {
    latitude += (random() - 0.45) * 0.0005;
    longitude += (random() - 0.4) * 0.0007;
    elevation += (random() - 0.5) * 3;
    const time = new Date(start + point * 5000).toISOString();
    parts.push(
      `<trkpt lat="${latitude.toFixed(6)}" lon="${longitude.toFixed(6)}"><ele>${elevation.toFixed(1)}</ele><time>${time}</time></trkpt>`,
    );
  }
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${parts.join('')}</trkseg></trk></gpx>`;
}

// huge: about 9.5 MB, the largest ride under the 10 MB upload limit.
export const SIZES = { typical: 2000, long: 10000, huge: 100000 };
