'use strict';

const sharp = require('sharp');
const {
  planThumbnailBackfill,
  applyThumbnailBackfill,
  runThumbnailBackfill,
} = require('./thumbnailBackfill');
const { PAGE_SIZE } = require('./queryItems');
const { fakeCosmosContainer, fakeBlobContainer } = require('../../test/scriptFakes');

const ENVIRONMENT = {
  COSMOS_CONNECTION_STRING: 'AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;',
  COSMOS_DATABASE: 'bikebuddy',
  BLOB_CONNECTION_STRING: 'UseDevelopmentStorage=true',
};

let photo;
beforeAll(async () => {
  photo = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 40, g: 90, b: 20 } },
  })
    .jpeg()
    .toBuffer();
});

function tourWithImages(id, blobNames) {
  return { id, userId: 'user-1', images: blobNames.map((blobName) => ({ blobName, lat: 48.1 })) };
}

function stores({ tours, blobs }) {
  const toursStore = fakeCosmosContainer({
    documents: tours,
    answerQuery: (documents) =>
      documents.filter(({ images }) => Array.isArray(images)).map(({ images }) => ({ images })),
    partitionKeyOf: (document) => document.userId,
  });
  const imagesStore = fakeBlobContainer(new Map(blobs.map((name) => [name, photo])));
  return { toursStore, imagesStore };
}

function recordingLog() {
  const lines = [];
  return {
    lines,
    info: (line) => lines.push(String(line)),
    error: (line) => lines.push(String(line)),
  };
}

function containersOf({ toursStore, imagesStore }, log = recordingLog()) {
  return { toursContainer: toursStore.container, imagesContainer: imagesStore.container, log };
}

describe('applyThumbnailBackfill', () => {
  it('creates a JPEG thumbnail next to each photo that lacks one', async () => {
    const state = stores({
      tours: [
        tourWithImages('t-1', ['user-1/t-1/a.jpg', 'user-1/t-1/b.jpg']),
        { id: 't-2', userId: 'user-1' },
        tourWithImages('t-3', ['user-1/t-3/c.jpg']),
      ],
      blobs: ['user-1/t-1/a.jpg', 'user-1/t-1/b.jpg', 'user-1/t-1/b_thumb.jpg', 'user-1/t-3/c.jpg'],
    });
    const log = recordingLog();

    const tally = await applyThumbnailBackfill(containersOf(state, log));

    expect(tally).toEqual({ changed: 2, skipped: 1, failed: 0 });
    expect(state.imagesStore.writes).toEqual([
      {
        upload: 'user-1/t-1/a_thumb.jpg',
        options: { blobHTTPHeaders: { blobContentType: 'image/jpeg' } },
      },
      {
        upload: 'user-1/t-3/c_thumb.jpg',
        options: { blobHTTPHeaders: { blobContentType: 'image/jpeg' } },
      },
    ]);
    const thumbnail = await sharp(state.imagesStore.blobs.get('user-1/t-1/a_thumb.jpg')).metadata();
    expect(thumbnail).toMatchObject({ format: 'jpeg', width: 320 });
    expect(state.imagesStore.blobs.get('user-1/t-1/a.jpg')).toBe(photo);
    expect(log.lines).toEqual([
      'Created user-1/t-1/a_thumb.jpg',
      'Created user-1/t-3/c_thumb.jpg',
      'Done: 2 thumbnail(s) created, 1 already existed, 0 failed.',
    ]);
  });

  it('reads only the image lists, a page at a time', async () => {
    const state = stores({ tours: [], blobs: [] });

    await applyThumbnailBackfill(containersOf(state));

    expect(state.toursStore.queries).toEqual([
      {
        query: 'SELECT c.images FROM c WHERE IS_ARRAY(c.images)',
        options: { maxItemCount: PAGE_SIZE },
      },
    ]);
  });

  it('counts a missing or undecodable photo as failed and carries on', async () => {
    const state = stores({
      tours: [tourWithImages('t-1', ['gone.jpg', 'corrupt.jpg', 'fine.jpg'])],
      blobs: ['fine.jpg'],
    });
    state.imagesStore.blobs.set('corrupt.jpg', Buffer.from('not an image'));
    const log = recordingLog();

    const tally = await applyThumbnailBackfill(containersOf(state, log));

    expect(tally).toEqual({ changed: 1, skipped: 0, failed: 2 });
    expect(state.imagesStore.writes.map(({ upload }) => upload)).toEqual(['fine_thumb.jpg']);
    expect(log.lines[0]).toBe('Image gone.jpg: BlobNotFound');
    expect(log.lines[1]).toMatch(/^Image corrupt\.jpg: .+/);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const state = stores({ tours: [tourWithImages('t-1', ['a.jpg'])], blobs: ['a.jpg'] });
    await applyThumbnailBackfill(containersOf(state));

    const tally = await applyThumbnailBackfill(containersOf(state));

    expect(tally).toEqual({ changed: 0, skipped: 1, failed: 0 });
    expect(state.imagesStore.writes).toHaveLength(1);
  });
});

describe('planThumbnailBackfill', () => {
  it('reports what would change and writes nothing', async () => {
    const state = stores({
      tours: [tourWithImages('t-1', ['a.jpg', 'b.jpg', 'gone.jpg'])],
      blobs: ['a.jpg', 'b.jpg', 'b_thumb.jpg'],
    });
    const log = recordingLog();

    const tally = await planThumbnailBackfill(containersOf(state, log));

    expect(tally).toEqual({ changed: 1, skipped: 1, failed: 1 });
    expect(state.imagesStore.writes).toEqual([]);
    expect(state.toursStore.writes).toEqual([]);
    expect([...state.imagesStore.blobs.keys()]).toEqual(['a.jpg', 'b.jpg', 'b_thumb.jpg']);
    expect(log.lines).toEqual([
      'Would create a_thumb.jpg',
      'Image gone.jpg: BlobNotFound',
      'Dry run, nothing changed: 1 thumbnail(s) would be created, 1 already exist, 1 failed.',
    ]);
  });
});

describe('runThumbnailBackfill', () => {
  function run({ argv = [], environment = ENVIRONMENT, blobs = ['a.jpg'] } = {}) {
    const state = stores({ tours: [tourWithImages('t-1', ['a.jpg'])], blobs });
    const log = recordingLog();
    const openContainers = vi.fn(async () => ({
      toursContainer: state.toursStore.container,
      imagesContainer: state.imagesStore.container,
    }));
    const exitCode = runThumbnailBackfill({ argv, environment, openContainers, log });
    return { exitCode, state, log, openContainers };
  }

  it.each([[[]], [['--dry-run']]])('is a dry run with arguments %j', async (argv) => {
    const { exitCode, state } = run({ argv });

    await expect(exitCode).resolves.toBe(0);
    expect(state.imagesStore.writes).toEqual([]);
  });

  it('writes with --apply', async () => {
    const { exitCode, state } = run({ argv: ['--apply'] });

    await expect(exitCode).resolves.toBe(0);
    expect(state.imagesStore.writes).toHaveLength(1);
  });

  it('exits 1 when any image failed', async () => {
    const { exitCode } = run({ argv: ['--apply'], blobs: [] });

    await expect(exitCode).resolves.toBe(1);
  });

  it('refuses --dry-run with --apply before opening anything', async () => {
    const { exitCode, openContainers, log } = run({ argv: ['--dry-run', '--apply'] });

    await expect(exitCode).resolves.toBe(1);
    expect(openContainers).not.toHaveBeenCalled();
    expect(log.lines.join('\n')).toContain('Pass either --dry-run or --apply, not both');
  });

  it('names the missing variables before opening anything', async () => {
    const { exitCode, openContainers, log } = run({
      environment: { ...ENVIRONMENT, BLOB_CONNECTION_STRING: undefined },
    });

    await expect(exitCode).resolves.toBe(1);
    expect(openContainers).not.toHaveBeenCalled();
    expect(log.lines.join('\n')).toContain('Missing environment variables: BLOB_CONNECTION_STRING');
  });
});
