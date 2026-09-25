// Seeds the local Functions host (SKIP_AUTH) with deterministic tracks of a realistic size.
const API = process.env.LIGHTHOUSE_API_URL ?? 'http://127.0.0.1:7071';
// Writes as whoever the API takes the caller for: only a host on this machine qualifies.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!LOCAL_HOSTS.has(new URL(API).hostname)) {
  throw new Error(`Refusing to seed ${API}: only a local Functions host is seeded`);
}
const TOURS = Number(process.env.LIGHTHOUSE_TOURS ?? 12);
const POINTS = 2000;

// Small deterministic PRNG (mulberry32): the same seed gives the same tracks.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gpx(index) {
  const random = rng(index + 1);
  let lat = 47.5 + random() * 1.5;
  let lon = 10.5 + random() * 2;
  let ele = 500 + random() * 800;
  const start = Date.UTC(2025, index % 12, 1 + (index % 27), 8);
  const points = [];
  for (let i = 0; i < POINTS; i++) {
    lat += (random() - 0.45) * 0.0006;
    lon += (random() - 0.4) * 0.0008;
    ele += (random() - 0.5) * 4;
    const time = new Date(start + i * 5000).toISOString();
    points.push(
      `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele><time>${time}</time></trkpt>`,
    );
  }
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${points.join('')}</trkseg></trk></gpx>`;
}

const listing = await fetch(`${API}/api/tours`);
if (!listing.ok) throw new Error(`listing the seeded tours failed: HTTP ${listing.status}`);
const existing = await listing.json();
if (existing.length >= TOURS) {
  console.log(`Already seeded (${existing.length} tours).`);
} else {
  for (let i = existing.length; i < TOURS; i++) {
    const form = new FormData();
    form.append('file', new Blob([gpx(i)], { type: 'application/gpx+xml' }), `ride-${i}.gpx`);
    const res = await fetch(
      `${API}/api/tours/upload?name=${encodeURIComponent(`Lighthouse ride ${i + 1}`)}`,
      {
        method: 'POST',
        body: form,
      },
    );
    if (res.status !== 201) throw new Error(`seeding tour ${i + 1} failed: HTTP ${res.status}`);
  }
  console.log(`Seeded ${TOURS - existing.length} tours.`);
}
