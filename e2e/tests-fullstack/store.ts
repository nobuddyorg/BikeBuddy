import { CosmosClient, type Database, type SqlQuerySpec } from '@azure/cosmos';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { assertEmulatorSettings } from '../emulator-guard';

// Only to read back what the API persisted and to clean up; seeding goes through the API.

/** The SKIP_AUTH identity of every full-stack request (functions/src/middleware/authMiddleware.js). */
export const DEV_USER_ID = 'local-dev-user';

// functions/src/lib/blobStorage.js's containers; every blob of a user sits under `${userId}/`.
const BLOB_CONTAINERS = ['gpx-files', 'tour-images'];
const DEV_USER_BLOB_PREFIX = `${DEV_USER_ID}/`;

export interface UserDocument {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  language?: string;
}

export interface TourDocument {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
}

/** A tour's points, stored apart from the tour under its id (#615). */
export interface TrackDocument {
  id: string;
  userId: string;
  heatmapData: [number, number][];
}

let stores: { database: Database; blobService: BlobServiceClient } | undefined;
function openStores() {
  if (!stores) {
    const settings = assertEmulatorSettings();
    stores = {
      database: new CosmosClient(settings.cosmosConnectionString).database(settings.cosmosDatabase),
      blobService: BlobServiceClient.fromConnectionString(settings.blobConnectionString),
    };
  }
  return stores;
}

const devUserQuery = (query: string): SqlQuerySpec => ({
  query,
  parameters: [{ name: '@userId', value: DEV_USER_ID }],
});

async function queryDevUserPartition<T>(container: string, query: string): Promise<T[]> {
  const { resources } = await openStores()
    .database.container(container)
    .items.query<T>(devUserQuery(query), { partitionKey: DEV_USER_ID })
    .fetchAll();
  return resources;
}

// `users` is partitioned by /id, `tours` and `tracks` by /userId: all keyed by the dev user's id.
export const devUserProfiles = () =>
  queryDevUserPartition<UserDocument>('users', 'SELECT * FROM c WHERE c.id = @userId');

export const devUserTours = () =>
  queryDevUserPartition<TourDocument>('tours', 'SELECT * FROM c WHERE c.userId = @userId');

export const devUserTracks = () =>
  queryDevUserPartition<TrackDocument>('tracks', 'SELECT * FROM c WHERE c.userId = @userId');

// The host creates a container on first use, so a fresh Azurite may not have it yet.
async function existingBlobContainers(): Promise<ContainerClient[]> {
  const containers = BLOB_CONTAINERS.map((name) =>
    openStores().blobService.getContainerClient(name),
  );
  const exists = await Promise.all(containers.map((container) => container.exists()));
  return containers.filter((_, index) => exists[index]);
}

async function devUserBlobs(): Promise<{ container: ContainerClient; name: string }[]> {
  const blobs: { container: ContainerClient; name: string }[] = [];
  for (const container of await existingBlobContainers()) {
    for await (const blob of container.listBlobsFlat({ prefix: DEV_USER_BLOB_PREFIX })) {
      blobs.push({ container, name: blob.name });
    }
  }
  return blobs;
}

/** Every blob of the dev user, as `<container>/<blob name>`. */
export const devUserBlobNames = async () =>
  (await devUserBlobs()).map(({ container, name }) => `${container.containerName}/${name}`);

const isNotFound = (error: unknown) => (error as { code?: unknown }).code === 404;

async function deleteDevUserDocument({ container, id }: { container: string; id: string }) {
  try {
    await openStores().database.container(container).item(id, DEV_USER_ID).delete();
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

/** Deletes the dev user's profile, tours, tracks and blobs; nothing of any other user. */
export async function resetDevUser(): Promise<void> {
  const [tours, tracks] = await Promise.all([devUserTours(), devUserTracks()]);
  await Promise.all([
    ...tours.map(({ id }) => deleteDevUserDocument({ container: 'tours', id })),
    ...tracks.map(({ id }) => deleteDevUserDocument({ container: 'tracks', id })),
  ]);
  await deleteDevUserDocument({ container: 'users', id: DEV_USER_ID });
  const blobs = await devUserBlobs();
  await Promise.all(
    blobs.map(({ container, name }) =>
      container.getBlobClient(name).deleteIfExists({ deleteSnapshots: 'include' }),
    ),
  );
}
