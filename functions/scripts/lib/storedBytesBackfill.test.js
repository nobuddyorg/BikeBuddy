'use strict';

const {
  planStoredBytesBackfill,
  applyStoredBytesBackfill,
  runStoredBytesBackfill,
} = require('./storedBytesBackfill');
const { fakeCosmosContainer, fakeBlobContainer } = require('../../test/scriptFakes');

const ENVIRONMENT = {
  COSMOS_CONNECTION_STRING: 'AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;',
  COSMOS_DATABASE: 'bikebuddy',
  BLOB_CONNECTION_STRING: 'UseDevelopmentStorage=true',
};

const tour = (id, extra = {}) => ({
  id,
  userId: 'user-1',
  schemaVersion: 2,
  _etag: `"etag-${id}"`,
  images: [],
  ...extra,
});
const bytes = (count) => Buffer.alloc(count);

// Plays PENDING_TOURS_QUERY: version 2, with the fields it selects.
function stores(tours, { gpx = {}, images = {} } = {}) {
  const toursStore = fakeCosmosContainer({
    documents: tours,
    answerQuery: (all) =>
      all
        .filter((stored) => stored.schemaVersion === 2)
        .map(({ id, userId, images: entries, _etag }) => ({ id, userId, images: entries, _etag })),
    partitionKeyOf: (document) => document.userId,
  });
  const gpxStore = fakeBlobContainer(new Map(Object.entries(gpx)));
  const imagesStore = fakeBlobContainer(new Map(Object.entries(images)));
  const containers = {
    toursContainer: toursStore.container,
    gpxContainer: gpxStore.container,
    imagesContainer: imagesStore.container,
  };
  return { toursStore, containers };
}

function recordingLog() {
  const lines = [];
  return { lines, info: (line) => lines.push(line), error: (line) => lines.push(`ERROR ${line}`) };
}

describe('applyStoredBytesBackfill', () => {
  it("records each tour's GPX size and each photo's stored sizes, then marks it 3", async () => {
    const { toursStore, containers } = stores(
      [tour('t1', { images: [{ id: 'i1', blobName: 'stale/name.jpg', lat: 48, lon: 11 }] })],
      {
        gpx: { 'user-1/t1.gpx': bytes(120) },
        images: { 'user-1/t1/i1.jpg': bytes(40), 'user-1/t1/i1_thumb.jpg': bytes(2) },
      },
    );

    const tally = await applyStoredBytesBackfill({ ...containers, log: recordingLog() });

    expect(tally).toEqual({ changed: 1, failed: 0 });
    expect(toursStore.writes).toEqual([
      {
        patch: 't1',
        partitionKey: 'user-1',
        operations: [
          { op: 'set', path: '/gpxBytes', value: 120 },
          {
            op: 'set',
            path: '/images',
            value: [{ id: 'i1', blobName: 'stale/name.jpg', lat: 48, lon: 11, bytes: 42 }],
          },
          { op: 'set', path: '/schemaVersion', value: 3 },
        ],
        options: { accessCondition: { type: 'IfMatch', condition: '"etag-t1"' } },
      },
    ]);
  });

  it('counts a blob that is gone as nothing', async () => {
    const { toursStore, containers } = stores([tour('t1', { images: [{ id: 'i1' }] })]);

    await applyStoredBytesBackfill({ ...containers, log: recordingLog() });

    const [{ operations }] = toursStore.writes;
    expect(operations[0].value).toBe(0);
    expect(operations[1].value).toEqual([{ id: 'i1', bytes: 0 }]);
  });

  it('writes an empty photo list for a tour without one', async () => {
    const { toursStore, containers } = stores([tour('t1', { images: undefined })], {
      gpx: { 'user-1/t1.gpx': bytes(5) },
    });

    await applyStoredBytesBackfill({ ...containers, log: recordingLog() });

    expect(toursStore.writes[0].operations[1]).toEqual({ op: 'set', path: '/images', value: [] });
  });

  it('counts a size read that fails for another reason as failed, changing nothing', async () => {
    const { toursStore, containers } = stores([tour('t1')]);
    containers.gpxContainer = {
      getBlockBlobClient: () => ({
        getProperties: async () => {
          throw Object.assign(new Error('storage down'), { statusCode: 503 });
        },
      }),
    };
    const log = recordingLog();

    const tally = await applyStoredBytesBackfill({ ...containers, log });

    expect(tally).toEqual({ changed: 0, failed: 1 });
    expect(toursStore.writes).toEqual([]);
    expect(log.lines).toContain('ERROR Tour t1: storage down');
  });

  it('counts a tour changed meanwhile as failed and carries on', async () => {
    const { toursStore, containers } = stores([tour('t1'), tour('t2')]);
    const patch = toursStore.container.item;
    toursStore.container.item = (id, partitionKey) =>
      id === 't1'
        ? {
            patch: async () => {
              throw Object.assign(new Error('Precondition failed'), { code: 412 });
            },
          }
        : patch(id, partitionKey);
    const log = recordingLog();

    const tally = await applyStoredBytesBackfill({ ...containers, log });

    expect(tally).toEqual({ changed: 1, failed: 1 });
    expect(log.lines).toContain('ERROR Tour t1: Precondition failed');
  });

  it('logs each change and a summary', async () => {
    const { containers } = stores([tour('t1', { images: [{ id: 'i1' }, { id: 'i2' }] })], {
      gpx: { 'user-1/t1.gpx': bytes(7) },
      images: { 'user-1/t1/i1.jpg': bytes(3), 'user-1/t1/i2_thumb.jpg': bytes(1) },
    });
    const log = recordingLog();

    await applyStoredBytesBackfill({ ...containers, log });

    expect(log.lines).toEqual([
      'Done: record the sizes of tour t1 (GPX 7 bytes, 2 photo(s) 4 bytes)',
      'Done: 1 tour(s) changed, 0 failed.',
    ]);
  });

  it('leaves tours of any other version alone', async () => {
    const { toursStore, containers } = stores([
      tour('t1', { schemaVersion: 1 }),
      tour('t3', { schemaVersion: 3 }),
    ]);

    const tally = await applyStoredBytesBackfill({ ...containers, log: recordingLog() });

    expect(tally).toEqual({ changed: 0, failed: 0 });
    expect(toursStore.writes).toEqual([]);
    expect(toursStore.queries[0].query).toBe(
      'SELECT c.id, c.userId, c.images, c._etag FROM c WHERE c.schemaVersion = 2',
    );
  });

  it('is idempotent: a second run changes nothing', async () => {
    const { toursStore, containers } = stores([tour('t1')], { gpx: { 'user-1/t1.gpx': bytes(1) } });

    await applyStoredBytesBackfill({ ...containers, log: recordingLog() });
    const second = await applyStoredBytesBackfill({ ...containers, log: recordingLog() });

    expect(second).toEqual({ changed: 0, failed: 0 });
    expect(toursStore.writes).toHaveLength(1);
  });
});

describe('planStoredBytesBackfill', () => {
  it('reports what an apply would do and writes nothing', async () => {
    const { toursStore, containers } = stores([tour('t1')], { gpx: { 'user-1/t1.gpx': bytes(9) } });
    const log = recordingLog();

    const tally = await planStoredBytesBackfill({ ...containers, log });

    expect(tally).toEqual({ changed: 1, failed: 0 });
    expect(toursStore.writes).toEqual([]);
    expect(log.lines).toEqual([
      'Would record the sizes of tour t1 (GPX 9 bytes, 0 photo(s) 0 bytes)',
      'Dry run, nothing changed: 1 tour(s) would change, 0 failed.',
    ]);
  });

  it('reports a failed read', async () => {
    const { containers } = stores([tour('t1')]);
    containers.imagesContainer = containers.gpxContainer;
    containers.gpxContainer = {
      getBlockBlobClient: () => ({
        getProperties: async () => {
          throw new Error('denied');
        },
      }),
    };
    const log = recordingLog();

    expect(await planStoredBytesBackfill({ ...containers, log })).toEqual({
      changed: 0,
      failed: 1,
    });
    expect(log.lines.at(-1)).toBe('Dry run, nothing changed: 0 tour(s) would change, 1 failed.');
  });
});

describe('runStoredBytesBackfill', () => {
  it('is a dry run by default and writes only with --apply', async () => {
    const dry = stores([tour('t1')]);
    const applied = stores([tour('t1')]);

    await expect(
      runStoredBytesBackfill({
        argv: [],
        environment: ENVIRONMENT,
        openContainers: async () => dry.containers,
        log: recordingLog(),
      }),
    ).resolves.toBe(0);
    await expect(
      runStoredBytesBackfill({
        argv: ['--apply'],
        environment: ENVIRONMENT,
        openContainers: async () => applied.containers,
        log: recordingLog(),
      }),
    ).resolves.toBe(0);

    expect(dry.toursStore.writes).toEqual([]);
    expect(applied.toursStore.writes).toHaveLength(1);
  });
});
