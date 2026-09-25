import { CosmosClient, type Container, type Database } from '@azure/cosmos';
import { assertEmulatorSettings } from '../emulator-guard';

// Direct Cosmos access, so tests can start from a clean database and assert what
// the backend persisted; the same emulator the Functions host uses, or nothing.

export interface UserDoc {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  language?: string;
}

let database: Database | undefined;
function db() {
  if (!database) {
    const { cosmosConnectionString, cosmosDatabase } = assertEmulatorSettings();
    database = new CosmosClient(cosmosConnectionString).database(cosmosDatabase);
  }
  return database;
}

function usersContainer(): Container {
  return db().container('users');
}

export function toursContainer(): Container {
  return db().container('tours');
}

// Partition key is /userId.
export async function clearTours(): Promise<void> {
  const { resources } = await toursContainer()
    .items.query<{ id: string; userId: string }>('SELECT c.id, c.userId FROM c')
    .fetchAll();
  for (const { id, userId } of resources) {
    await toursContainer().item(id, userId).delete();
  }
}

// Partition key is /id.
export async function clearUsers(): Promise<void> {
  const { resources } = await usersContainer()
    .items.query<{ id: string }>('SELECT c.id FROM c')
    .fetchAll();
  for (const { id } of resources) {
    await usersContainer().item(id, id).delete();
  }
}

export async function listUsers(): Promise<UserDoc[]> {
  const { resources } = await usersContainer().items.query<UserDoc>('SELECT * FROM c').fetchAll();
  return resources;
}
