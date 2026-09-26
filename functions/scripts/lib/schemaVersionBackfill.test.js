'use strict';

const {
  upgradeOperations,
  planSchemaVersionBackfill,
  applySchemaVersionBackfill,
  runSchemaVersionBackfill,
} = require('./schemaVersionBackfill');
const { PAGE_SIZE } = require('./queryItems');
const { fakeCosmosContainer } = require('../../test/scriptFakes');

const ENVIRONMENT = {
  COSMOS_CONNECTION_STRING: 'AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;',
  COSMOS_DATABASE: 'bikebuddy',
  BLOB_CONNECTION_STRING: 'UseDevelopmentStorage=true',
};

const statsTour = (id, extra = {}) => ({
  id,
  userId: 'user-1',
  images: [],
  elevationGain: null,
  ...extra,
});

// Plays UNVERSIONED_TOURS_QUERY: unversioned tours only, as id, userId and two flags.
function toursStore(documents) {
  return fakeCosmosContainer({
    documents,
    answerQuery: (all) =>
      all
        .filter((document) => document.schemaVersion === undefined)
        .map((document) => ({
          id: document.id,
          userId: document.userId,
          hasImages: document.images !== undefined,
          hasStats: document.elevationGain !== undefined,
        })),
    partitionKeyOf: (document) => document.userId,
  });
}

function recordingLog() {
  const lines = [];
  return {
    lines,
    info: (line) => lines.push(String(line)),
    error: (line) => lines.push(String(line)),
  };
}

describe('upgradeOperations', () => {
  it('only sets the version on a tour that already has its images array', () => {
    expect(upgradeOperations({ hasImages: true })).toEqual([
      { op: 'set', path: '/schemaVersion', value: 1 },
    ]);
  });

  it('adds the empty images array a tour from before photos lacks', () => {
    expect(upgradeOperations({ hasImages: false })).toEqual([
      { op: 'set', path: '/images', value: [] },
      { op: 'set', path: '/schemaVersion', value: 1 },
    ]);
  });
});

describe('applySchemaVersionBackfill', () => {
  it('marks the tours that have their stats, and leaves the others for the stats backfill', async () => {
    const store = toursStore([
      statsTour('t-1'),
      statsTour('t-2', { images: undefined }),
      statsTour('t-3', { elevationGain: undefined }),
      statsTour('t-done', { schemaVersion: 1 }),
    ]);
    const log = recordingLog();

    const tally = await applySchemaVersionBackfill({ toursContainer: store.container, log });

    expect(tally).toEqual({ changed: 2, waiting: 1, failed: 0 });
    expect(
      store.documents.map(({ id, schemaVersion, images }) => [id, schemaVersion, images]),
    ).toEqual([
      ['t-1', 1, []],
      ['t-2', 1, []],
      ['t-3', undefined, []],
      ['t-done', 1, []],
    ]);
    expect(log.lines).toEqual([
      'Marked tour t-1 as version 1',
      'Marked tour t-2 as version 1',
      'Tour t-3 has no stats yet: run backfillTourStats.js first',
      'Done: 2 tour(s) marked, 1 wait for the stats backfill, 0 failed.',
    ]);
  });

  it('reads only flags, a page at a time, and never the track', async () => {
    const store = toursStore([]);

    await applySchemaVersionBackfill({ toursContainer: store.container, log: recordingLog() });

    expect(store.queries).toEqual([
      {
        query:
          'SELECT c.id, c.userId, IS_DEFINED(c.images) AS hasImages, ' +
          'IS_DEFINED(c.elevationGain) AS hasStats FROM c WHERE NOT IS_DEFINED(c.schemaVersion)',
        options: { maxItemCount: PAGE_SIZE },
      },
    ]);
  });

  it('counts a failed patch as failed and carries on', async () => {
    const store = toursStore([statsTour('t-busy'), statsTour('t-ok')]);
    const item = store.container.item.bind(store.container);
    store.container.item = (id, partitionKey) =>
      id === 't-busy'
        ? { patch: async () => Promise.reject(new Error('Request rate is large')) }
        : item(id, partitionKey);
    const log = recordingLog();

    const tally = await applySchemaVersionBackfill({ toursContainer: store.container, log });

    expect(tally).toEqual({ changed: 1, waiting: 0, failed: 1 });
    expect(log.lines[0]).toBe('Tour t-busy: Request rate is large');
    expect(store.documents[1].schemaVersion).toBe(1);
  });
});

describe('planSchemaVersionBackfill', () => {
  it('writes nothing and reports what an apply would do', async () => {
    const store = toursStore([statsTour('t-1'), statsTour('t-2', { elevationGain: undefined })]);
    const log = recordingLog();

    const tally = await planSchemaVersionBackfill({ toursContainer: store.container, log });

    expect(tally).toEqual({ changed: 1, waiting: 1, failed: 0 });
    expect(store.writes).toEqual([]);
    expect(log.lines).toEqual([
      'Would mark tour t-1 as version 1',
      'Tour t-2 has no stats yet: run backfillTourStats.js first',
      'Dry run, nothing changed: 1 tour(s) would be marked, 1 wait for the stats backfill, 0 failed.',
    ]);
  });
});

describe('runSchemaVersionBackfill', () => {
  const run = (argv, store) =>
    runSchemaVersionBackfill({
      argv,
      environment: ENVIRONMENT,
      openContainers: async () => ({ toursContainer: store.container }),
      log: recordingLog(),
    });

  it('is a dry run by default and writes only with --apply', async () => {
    const store = toursStore([statsTour('t-1')]);

    expect(await run([], store)).toBe(0);
    expect(store.writes).toEqual([]);
    expect(await run(['--apply'], store)).toBe(0);
    expect(store.documents[0].schemaVersion).toBe(1);
  });
});
