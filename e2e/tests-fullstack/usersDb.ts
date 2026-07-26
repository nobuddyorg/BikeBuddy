import { CosmosClient, type Container } from '@azure/cosmos';

// Direct Cosmos access, so tests can start from a clean database and assert what
// the backend persisted. Falls back to the well-known emulator endpoint when
// COSMOS_CONNECTION_STRING isn't exported.
const CONNECTION_STRING =
  process.env.COSMOS_CONNECTION_STRING ||
  'AccountEndpoint=http://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b5n5NVmBSuvpToAw==';
const DATABASE = process.env.COSMOS_DATABASE || 'bikebuddy';

export interface UserDoc {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  language?: string;
}

let client: CosmosClient | undefined;
function db() {
  if (!client) client = new CosmosClient(CONNECTION_STRING);
  return client.database(DATABASE);
}

export function usersContainer(): Container {
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
