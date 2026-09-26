'use strict';

const {
  tourOperations,
  planTrackBackfill,
  applyTrackBackfill,
  runTrackBackfill,
} = require('./trackBackfill');
const { PAGE_SIZE } = require('./queryItems');
const { fakeCosmosContainer, fakeBlobContainer } = require('../../test/scriptFakes');

const ENVIRONMENT = {
  COSMOS_CONNECTION_STRING: 'AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;',
  COSMOS_DATABASE: 'bikebuddy',
  BLOB_CONNECTION_STRING: 'UseDevelopmentStorage=true',
};
const POINTS = [
  [48.1, 11.5],
  [48.2, 11.6],
];
// Two rides a day apart: the rebuilt track breaks the line between them (#552).
const TWO_RIDES_GPX = Buffer.from(`<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk>
  <trkseg><trkpt lat="48" lon="11"/><trkpt lat="49" lon="12"/></trkseg>
  <trkseg><trkpt lat="52" lon="13"/><trkpt lat="52" lon="13.01"/><trkpt lat="52" lon="13.02"/></trkseg>
</trk></gpx>`);
const TWO_RIDES = {
  heatmapData: [
    [48, 11],
    [49, 12],
    [52, 13],
    [52, 13.01],
    [52, 13.02],
  ],
  segmentStarts: [2],
};

const inlineTour = (id, extra = {}) => ({
  id,
  userId: 'user-1',
  schemaVersion: 1,
  heatmapData: POINTS,
  ...extra,
});

// Plays PENDING_TOURS_QUERY: points still inline, or version 1 without them.
function stores(tours, gpxBlobs = {}) {
  const toursStore = fakeCosmosContainer({
    documents: tours,
    answerQuery: (all) =>
      all
        .filter((tour) => 'heatmapData' in tour || tour.schemaVersion === 1)
        .map(({ id, userId, schemaVersion, heatmapData }) => ({
          id,
          userId,
          ...(schemaVersion !== undefined && { schemaVersion }),
          ...(heatmapData !== undefined && { heatmapData }),
        })),
    partitionKeyOf: (document) => document.userId,
  });
  const tracksStore = fakeCosmosContainer({
    documents: [],
    answerQuery: () => [],
    partitionKeyOf: (document) => document.userId,
  });
  const gpxStore = fakeBlobContainer(new Map(Object.entries(gpxBlobs)));
  return { toursStore, tracksStore, gpxStore };
}

function recordingLog() {
  const lines = [];
  return {
    lines,
    info: (line) => lines.push(String(line)),
    error: (line) => lines.push(String(line)),
  };
}

const containersOf = ({ toursStore, tracksStore, gpxStore }, log = recordingLog()) => ({
  toursContainer: toursStore.container,
  tracksContainer: tracksStore.container,
  gpxContainer: gpxStore.container,
  log,
});

describe('tourOperations', () => {
  it("counts the new track's points, drops the inline ones and marks version 1 as 2", () => {
    expect(tourOperations(inlineTour('t1'), TWO_RIDES)).toEqual([
      { op: 'set', path: '/pointCount', value: 5 },
      { op: 'remove', path: '/heatmapData' },
      { op: 'set', path: '/schemaVersion', value: 2 },
    ]);
  });

  it('moves the points of an unversioned tour but leaves its version to the schema backfill', () => {
    expect(tourOperations(inlineTour('t1', { schemaVersion: undefined }), TWO_RIDES)).toEqual([
      { op: 'set', path: '/pointCount', value: 5 },
      { op: 'remove', path: '/heatmapData' },
    ]);
  });

  it('only marks a version-1 tour whose points were moved before it was versioned', () => {
    expect(tourOperations({ id: 't1', userId: 'user-1', schemaVersion: 1 }, undefined)).toEqual([
      { op: 'set', path: '/schemaVersion', value: 2 },
    ]);
  });
});

describe('applyTrackBackfill', () => {
  it('rebuilds each track from its GPX, breaks included, then drops the inline points', async () => {
    const state = stores([inlineTour('t1', { name: 'Alps' })], {
      'user-1/t1.gpx': TWO_RIDES_GPX,
    });

    const tally = await applyTrackBackfill(containersOf(state));

    expect(tally).toEqual({ changed: 1, failed: 0 });
    expect(state.tracksStore.documents).toEqual([
      { id: 't1', userId: 'user-1', schemaVersion: 1, ...TWO_RIDES },
    ]);
    expect(state.toursStore.documents).toEqual([
      { id: 't1', userId: 'user-1', schemaVersion: 2, name: 'Alps', pointCount: 5 },
    ]);
  });

  it.each([
    ['no GPX file', {}],
    ['an unreadable GPX file', { 'user-1/t1.gpx': Buffer.from('<html></html>') }],
  ])('moves the inline points as one line for a tour with %s', async (_label, gpxBlobs) => {
    const state = stores([inlineTour('t1'), inlineTour('t2', { heatmapData: null })], gpxBlobs);

    await applyTrackBackfill(containersOf(state));

    expect(state.tracksStore.documents).toEqual([
      { id: 't1', userId: 'user-1', schemaVersion: 1, heatmapData: POINTS, segmentStarts: [] },
      { id: 't2', userId: 'user-1', schemaVersion: 1, heatmapData: [], segmentStarts: [] },
    ]);
    expect(state.toursStore.documents.map((tour) => tour.pointCount)).toEqual([2, 0]);
  });

  it('counts a GPX read that fails for another reason as failed, changing nothing', async () => {
    const state = stores([inlineTour('t1')]);
    state.gpxStore.container.getBlockBlobClient = () => ({
      downloadToBuffer: async () => Promise.reject(new Error('Server busy')),
    });
    const log = recordingLog();

    const tally = await applyTrackBackfill(containersOf(state, log));

    expect(tally).toEqual({ changed: 0, failed: 1 });
    expect(state.tracksStore.writes).toEqual([]);
    expect(log.lines).toContain('Tour t1: Server busy');
  });

  it('only marks a tour moved before its version-1 mark, writing no track', async () => {
    const state = stores([{ id: 't1', userId: 'user-1', schemaVersion: 1, pointCount: 2 }]);

    const tally = await applyTrackBackfill(containersOf(state));

    expect(tally).toEqual({ changed: 1, failed: 0 });
    expect(state.tracksStore.writes).toEqual([]);
    expect(state.toursStore.documents).toEqual([
      { id: 't1', userId: 'user-1', schemaVersion: 2, pointCount: 2 },
    ]);
  });

  it('logs each change and a summary', async () => {
    const state = stores(
      [{ id: 't1', userId: 'user-1', schemaVersion: 1, pointCount: 2 }, inlineTour('t2')],
      { 'user-1/t2.gpx': TWO_RIDES_GPX },
    );
    const log = recordingLog();

    await applyTrackBackfill(containersOf(state, log));

    expect(log.lines).toEqual([
      'Done: mark tour t1 as version 2',
      'Done: move the track of tour t2 (5 points, 2 segment(s), from its GPX)',
      'Done: 2 tour(s) changed, 0 failed.',
    ]);
  });

  it('writes the track before the tour, so a failed patch leaves the points in both places', async () => {
    const state = stores([inlineTour('t1')]);
    state.toursStore.container.item = () => ({
      patch: async () => Promise.reject(new Error('Request rate is large')),
    });
    const log = recordingLog();

    const tally = await applyTrackBackfill(containersOf(state, log));

    expect(tally).toEqual({ changed: 0, failed: 1 });
    expect(state.tracksStore.documents.map((track) => track.id)).toEqual(['t1']);
    expect(state.toursStore.documents[0].heatmapData).toEqual(POINTS);
    expect(log.lines).toContain('Tour t1: Request rate is large');
  });

  it('is idempotent: a second run changes nothing', async () => {
    const state = stores([inlineTour('t1'), inlineTour('t2', { schemaVersion: undefined })]);
    await applyTrackBackfill(containersOf(state));
    const after = structuredClone(state.toursStore.documents);
    const writes = state.toursStore.writes.length + state.tracksStore.writes.length;

    const tally = await applyTrackBackfill(containersOf(state));

    expect(tally).toEqual({ changed: 0, failed: 0 });
    expect(state.toursStore.writes.length + state.tracksStore.writes.length).toBe(writes);
    expect(state.toursStore.documents).toEqual(after);
  });

  it('reads the pending tours a page at a time', async () => {
    const state = stores([]);

    await applyTrackBackfill(containersOf(state));

    expect(state.toursStore.queries).toEqual([
      {
        query:
          'SELECT c.id, c.userId, c.schemaVersion, c.heatmapData FROM c ' +
          'WHERE IS_DEFINED(c.heatmapData) OR c.schemaVersion = 1',
        options: { maxItemCount: PAGE_SIZE },
      },
    ]);
  });
});

describe('planTrackBackfill', () => {
  it('reports what an apply would do and writes nothing', async () => {
    const state = stores(
      [inlineTour('t1'), { id: 't2', userId: 'user-1', schemaVersion: 1, pointCount: 2 }],
      {},
    );
    const before = structuredClone(state.toursStore.documents);
    const log = recordingLog();

    const tally = await planTrackBackfill(containersOf(state, log));

    expect(tally).toEqual({ changed: 2, failed: 0 });
    expect([...state.toursStore.writes, ...state.tracksStore.writes]).toEqual([]);
    expect(state.toursStore.documents).toEqual(before);
    expect(log.lines).toEqual([
      'Would move the track of tour t1 (2 points, 1 segment(s), from its inline points)',
      'Would mark tour t2 as version 2',
      'Dry run, nothing changed: 2 tour(s) would change, 0 failed.',
    ]);
  });
});

describe('runTrackBackfill', () => {
  it('is a dry run by default and writes only with --apply', async () => {
    const dry = stores([inlineTour('t1')]);
    const applied = stores([inlineTour('t1')]);
    const openContainers = (state) => async () => ({
      toursContainer: state.toursStore.container,
      tracksContainer: state.tracksStore.container,
      gpxContainer: state.gpxStore.container,
    });

    await expect(
      runTrackBackfill({
        argv: [],
        environment: ENVIRONMENT,
        openContainers: openContainers(dry),
        log: recordingLog(),
      }),
    ).resolves.toBe(0);
    await expect(
      runTrackBackfill({
        argv: ['--apply'],
        environment: ENVIRONMENT,
        openContainers: openContainers(applied),
        log: recordingLog(),
      }),
    ).resolves.toBe(0);

    expect(dry.tracksStore.writes).toEqual([]);
    expect(applied.tracksStore.writes).toEqual([{ upsert: 't1', partitionKey: 'user-1' }]);
  });
});
