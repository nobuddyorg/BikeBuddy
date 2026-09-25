'use strict';

const {
  statPatchOperations,
  planTourStatsBackfill,
  applyTourStatsBackfill,
  runTourStatsBackfill,
} = require('./tourStatsBackfill');
const { PAGE_SIZE } = require('./queryItems');
const { parseGpx } = require('../../src/lib/parseGpx');
const { fakeCosmosContainer, fakeBlobContainer } = require('../../test/scriptFakes');

const ENVIRONMENT = {
  COSMOS_CONNECTION_STRING: 'AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;',
  COSMOS_DATABASE: 'bikebuddy',
  BLOB_CONNECTION_STRING: 'UseDevelopmentStorage=true',
};

const GPX_WITH_ELEVATION = Buffer.from(`<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.582"><ele>500</ele><time>2024-06-01T10:00:00Z</time></trkpt>
    <trkpt lat="48.1451" lon="11.592"><ele>560</ele><time>2024-06-01T10:10:00Z</time></trkpt>
    <trkpt lat="48.1551" lon="11.602"><ele>530</ele><time>2024-06-01T10:20:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`);

const GPX_WITHOUT_ELEVATION = Buffer.from(`<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg><trkpt lat="48.1351" lon="11.582"/><trkpt lat="48.1361" lon="11.583"/></trkseg></trk>
</gpx>`);

// Tours stored before the stats existed carry none of the stat fields.
function oldShapeTour(id, userId = 'user-1') {
  return { id, userId, name: `Tour ${id}`, distanceKm: 3.2, heatmapData: [[48.1, 11.5]] };
}

function stores({ tours, gpxBlobs }) {
  const toursStore = fakeCosmosContainer({
    documents: tours,
    answerQuery: (documents) =>
      documents
        .filter((document) => document.elevationGain === undefined)
        .map(({ id, userId }) => ({ id, userId })),
    partitionKeyOf: (document) => document.userId,
  });
  const gpxStore = fakeBlobContainer(new Map(Object.entries(gpxBlobs)));
  return { toursStore, gpxStore };
}

function recordingLog() {
  const lines = [];
  return {
    lines,
    info: (line) => lines.push(String(line)),
    error: (line) => lines.push(String(line)),
  };
}

function containersOf({ toursStore, gpxStore }, log = recordingLog()) {
  return { toursContainer: toursStore.container, gpxContainer: gpxStore.container, log };
}

describe('statPatchOperations', () => {
  it('sets every stat field from the parsed GPX', () => {
    const stats = parseGpx(GPX_WITH_ELEVATION);

    expect(statPatchOperations(stats)).toEqual([
      { op: 'set', path: '/elevationGain', value: stats.elevationGain },
      { op: 'set', path: '/elevationLoss', value: stats.elevationLoss },
      { op: 'set', path: '/minElevation', value: 500 },
      { op: 'set', path: '/maxElevation', value: 560 },
      { op: 'set', path: '/durationSeconds', value: 1200 },
      { op: 'set', path: '/movingSeconds', value: stats.movingSeconds },
      { op: 'set', path: '/avgSpeed', value: stats.avgSpeed },
    ]);
  });
});

describe('applyTourStatsBackfill', () => {
  it('patches the stats onto old-shape tours only, by their partition key', async () => {
    const migrated = { ...oldShapeTour('t-done'), elevationGain: null };
    const state = stores({
      tours: [oldShapeTour('t-1', 'user-1'), migrated, oldShapeTour('t-2', 'user-2')],
      gpxBlobs: { 'user-1/t-1.gpx': GPX_WITH_ELEVATION, 'user-2/t-2.gpx': GPX_WITHOUT_ELEVATION },
    });

    const tally = await applyTourStatsBackfill(containersOf(state));

    expect(tally).toEqual({ changed: 2, failed: 0 });
    expect(state.toursStore.writes.map(({ patch, partitionKey }) => [patch, partitionKey])).toEqual(
      [
        ['t-1', 'user-1'],
        ['t-2', 'user-2'],
      ],
    );
    const [first, , second] = state.toursStore.documents;
    expect(first).toMatchObject({ elevationGain: 60, minElevation: 500, maxElevation: 560 });
    expect(first.heatmapData).toEqual([[48.1, 11.5]]);
    expect(second).toMatchObject({ elevationGain: null, durationSeconds: null, avgSpeed: null });
  });

  it('reads only the ids it needs, a page at a time', async () => {
    const state = stores({ tours: [], gpxBlobs: {} });

    await applyTourStatsBackfill(containersOf(state));

    expect(state.toursStore.queries).toEqual([
      {
        query: 'SELECT c.id, c.userId FROM c WHERE NOT IS_DEFINED(c.elevationGain)',
        options: { maxItemCount: PAGE_SIZE },
      },
    ]);
  });

  it('counts a missing or unparsable GPX file as failed and carries on', async () => {
    const state = stores({
      tours: [oldShapeTour('t-missing'), oldShapeTour('t-broken'), oldShapeTour('t-ok')],
      gpxBlobs: {
        'user-1/t-broken.gpx': Buffer.from('<html></html>'),
        'user-1/t-ok.gpx': GPX_WITH_ELEVATION,
      },
    });
    const log = recordingLog();

    const tally = await applyTourStatsBackfill(containersOf(state, log));

    expect(tally).toEqual({ changed: 1, failed: 2 });
    expect(state.toursStore.writes.map(({ patch }) => patch)).toEqual(['t-ok']);
    expect(log.lines).toEqual([
      'Tour t-missing: BlobNotFound',
      'Tour t-broken: Not a valid GPX file',
      'Backfilled tour t-ok',
      'Done: 1 tour(s) backfilled, 2 failed.',
    ]);
  });

  it('counts a failed patch as failed and carries on', async () => {
    const state = stores({
      tours: [oldShapeTour('t-1'), oldShapeTour('t-2')],
      gpxBlobs: { 'user-1/t-1.gpx': GPX_WITH_ELEVATION, 'user-1/t-2.gpx': GPX_WITH_ELEVATION },
    });
    const patchOnce = state.toursStore.container.item;
    state.toursStore.container.item = (id, partitionKey) =>
      id === 't-1'
        ? { patch: async () => Promise.reject(new Error('Request rate is large')) }
        : patchOnce(id, partitionKey);

    const tally = await applyTourStatsBackfill(containersOf(state));

    expect(tally).toEqual({ changed: 1, failed: 1 });
  });

  it('is idempotent: a second run changes nothing', async () => {
    const state = stores({
      tours: [oldShapeTour('t-1')],
      gpxBlobs: { 'user-1/t-1.gpx': GPX_WITH_ELEVATION },
    });
    await applyTourStatsBackfill(containersOf(state));
    const afterFirstRun = structuredClone(state.toursStore.documents);
    const writesAfterFirstRun = state.toursStore.writes.length;

    const tally = await applyTourStatsBackfill(containersOf(state));

    expect(tally).toEqual({ changed: 0, failed: 0 });
    expect(state.toursStore.writes).toHaveLength(writesAfterFirstRun);
    expect(state.toursStore.documents).toEqual(afterFirstRun);
  });
});

describe('planTourStatsBackfill', () => {
  it('reports what would change and writes nothing', async () => {
    const state = stores({
      tours: [oldShapeTour('t-1'), oldShapeTour('t-missing')],
      gpxBlobs: { 'user-1/t-1.gpx': GPX_WITH_ELEVATION },
    });
    const before = structuredClone(state.toursStore.documents);
    const log = recordingLog();

    const tally = await planTourStatsBackfill(containersOf(state, log));

    expect(tally).toEqual({ changed: 1, failed: 1 });
    expect(state.toursStore.writes).toEqual([]);
    expect(state.gpxStore.writes).toEqual([]);
    expect(state.toursStore.documents).toEqual(before);
    expect(log.lines).toEqual([
      'Would backfill tour t-1',
      'Tour t-missing: BlobNotFound',
      'Dry run, nothing changed: 1 tour(s) would be backfilled, 1 failed.',
    ]);
  });
});

describe('runTourStatsBackfill', () => {
  function run({ argv = [], environment = ENVIRONMENT, tours, gpxBlobs = {} }) {
    const state = stores({ tours, gpxBlobs });
    const log = recordingLog();
    const openContainers = vi.fn(async () => ({
      toursContainer: state.toursStore.container,
      gpxContainer: state.gpxStore.container,
    }));
    const exitCode = runTourStatsBackfill({ argv, environment, openContainers, log });
    return { exitCode, state, log, openContainers };
  }
  const pendingTour = () => ({
    tours: [oldShapeTour('t-1')],
    gpxBlobs: { 'user-1/t-1.gpx': GPX_WITH_ELEVATION },
  });

  it.each([[[]], [['--dry-run']]])('is a dry run with arguments %j', async (argv) => {
    const { exitCode, state } = run({ argv, ...pendingTour() });

    await expect(exitCode).resolves.toBe(0);
    expect(state.toursStore.writes).toEqual([]);
  });

  it('writes with --apply', async () => {
    const { exitCode, state } = run({ argv: ['--apply'], ...pendingTour() });

    await expect(exitCode).resolves.toBe(0);
    expect(state.toursStore.writes).toHaveLength(1);
  });

  it('exits 1 when any tour failed', async () => {
    const { exitCode } = run({ argv: ['--apply'], tours: [oldShapeTour('t-missing')] });

    await expect(exitCode).resolves.toBe(1);
  });

  it.each([[['--dry-run', '--apply']], [['--write']], [['stray']]])(
    'refuses the arguments %j before opening anything',
    async (argv) => {
      const { exitCode, openContainers } = run({ argv, ...pendingTour() });

      await expect(exitCode).resolves.toBe(1);
      expect(openContainers).not.toHaveBeenCalled();
    },
  );

  it('names the missing variables before opening anything', async () => {
    const { exitCode, openContainers, log } = run({ environment: {}, ...pendingTour() });

    await expect(exitCode).resolves.toBe(1);
    expect(openContainers).not.toHaveBeenCalled();
    expect(log.lines.join('\n')).toContain(
      'Missing environment variables: COSMOS_CONNECTION_STRING, COSMOS_DATABASE, BLOB_CONNECTION_STRING',
    );
  });
});
