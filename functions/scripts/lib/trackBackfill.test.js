'use strict';

const {
  tourOperations,
  planTrackBackfill,
  applyTrackBackfill,
  runTrackBackfill,
} = require('./trackBackfill');
const { PAGE_SIZE } = require('./queryItems');
const { fakeCosmosContainer } = require('../../test/scriptFakes');

const ENVIRONMENT = {
  COSMOS_CONNECTION_STRING: 'AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;',
  COSMOS_DATABASE: 'bikebuddy',
  BLOB_CONNECTION_STRING: 'UseDevelopmentStorage=true',
};
const POINTS = [
  [48.1, 11.5],
  [48.2, 11.6],
];

const inlineTour = (id, extra = {}) => ({
  id,
  userId: 'user-1',
  schemaVersion: 1,
  heatmapData: POINTS,
  ...extra,
});

// Plays PENDING_TOURS_QUERY: points still inline, or version 1 without them.
function stores(tours) {
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
  return { toursStore, tracksStore };
}

function recordingLog() {
  const lines = [];
  return {
    lines,
    info: (line) => lines.push(String(line)),
    error: (line) => lines.push(String(line)),
  };
}

const containersOf = ({ toursStore, tracksStore }, log = recordingLog()) => ({
  toursContainer: toursStore.container,
  tracksContainer: tracksStore.container,
  log,
});

describe('tourOperations', () => {
  it('counts the points, drops them from the tour and marks version 1 as 2', () => {
    expect(tourOperations(inlineTour('t1'))).toEqual([
      { op: 'set', path: '/pointCount', value: 2 },
      { op: 'remove', path: '/heatmapData' },
      { op: 'set', path: '/schemaVersion', value: 2 },
    ]);
  });

  it('moves the points of an unversioned tour but leaves its version to the schema backfill', () => {
    expect(tourOperations(inlineTour('t1', { schemaVersion: undefined }))).toEqual([
      { op: 'set', path: '/pointCount', value: 2 },
      { op: 'remove', path: '/heatmapData' },
    ]);
  });

  it('only marks a version-1 tour whose points were moved before it was versioned', () => {
    expect(tourOperations({ id: 't1', userId: 'user-1', schemaVersion: 1 })).toEqual([
      { op: 'set', path: '/schemaVersion', value: 2 },
    ]);
  });

  it('counts no points for inline points that are not a list', () => {
    expect(tourOperations(inlineTour('t1', { heatmapData: null }))[0]).toEqual({
      op: 'set',
      path: '/pointCount',
      value: 0,
    });
  });
});

describe('applyTrackBackfill', () => {
  it('writes each track item, then the tour without its points, by partition', async () => {
    const state = stores([
      inlineTour('t1', { name: 'Alps' }),
      inlineTour('t2', { userId: 'user-2' }),
      { id: 't3', userId: 'user-1', schemaVersion: 2, pointCount: 2 },
    ]);

    const tally = await applyTrackBackfill(containersOf(state));

    expect(tally).toEqual({ changed: 2, failed: 0 });
    expect(state.tracksStore.documents).toEqual([
      { id: 't1', userId: 'user-1', schemaVersion: 1, heatmapData: POINTS },
      { id: 't2', userId: 'user-2', schemaVersion: 1, heatmapData: POINTS },
    ]);
    expect(state.toursStore.documents).toEqual([
      { id: 't1', userId: 'user-1', schemaVersion: 2, name: 'Alps', pointCount: 2 },
      { id: 't2', userId: 'user-2', schemaVersion: 2, pointCount: 2 },
      { id: 't3', userId: 'user-1', schemaVersion: 2, pointCount: 2 },
    ]);
    expect(
      [...state.tracksStore.writes, ...state.toursStore.writes].map(
        (write) => write.upsert ?? write.patch,
      ),
    ).toEqual(['t1', 't2', 't1', 't2']);
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
    const state = stores([
      { id: 't1', userId: 'user-1', schemaVersion: 1, pointCount: 2 },
      inlineTour('t2'),
    ]);
    const log = recordingLog();

    await applyTrackBackfill(containersOf(state, log));

    expect(log.lines).toEqual([
      'Done: mark tour t1 as version 2',
      'Done: move the track of tour t2 (2 points)',
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
    const state = stores([
      inlineTour('t1'),
      { id: 't2', userId: 'user-1', schemaVersion: 1, pointCount: 2 },
    ]);
    const before = structuredClone(state.toursStore.documents);
    const log = recordingLog();

    const tally = await planTrackBackfill(containersOf(state, log));

    expect(tally).toEqual({ changed: 2, failed: 0 });
    expect([...state.toursStore.writes, ...state.tracksStore.writes]).toEqual([]);
    expect(state.toursStore.documents).toEqual(before);
    expect(log.lines).toEqual([
      'Would move the track of tour t1 (2 points)',
      'Would mark tour t2 as version 2',
      'Dry run, nothing changed: 2 tour(s) would change, 0 failed.',
    ]);
  });
});

describe('a tour whose inline points are not a list', () => {
  it('is reported with no points and moved as an empty track', async () => {
    const state = stores([inlineTour('t1', { heatmapData: null })]);
    const log = recordingLog();

    await planTrackBackfill(containersOf(state, log));
    await applyTrackBackfill(containersOf(state));

    expect(log.lines[0]).toBe('Would move the track of tour t1 (0 points)');
    expect(state.tracksStore.documents).toEqual([
      { id: 't1', userId: 'user-1', schemaVersion: 1, heatmapData: [] },
    ]);
    expect(state.toursStore.documents[0]).not.toHaveProperty('heatmapData');
  });
});

describe('runTrackBackfill', () => {
  it('is a dry run by default and writes only with --apply', async () => {
    const dry = stores([inlineTour('t1')]);
    const applied = stores([inlineTour('t1')]);
    const openContainers = (state) => async () => ({
      toursContainer: state.toursStore.container,
      tracksContainer: state.tracksStore.container,
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
