'use strict';

// Deterministic guards (load-testing.md); emulator RU is nominal, so its bound is coarse.
const { randomUUID } = require('node:crypto');
const { CosmosClient } = require('@azure/cosmos');
const { queryUserItems, MAX_ITEMS_PER_REQUEST } = require('../../src/lib/db');
const { assertEmulatorTargets } = require('./emulatorGuard');

const { cosmosConnectionString } = assertEmulatorTargets();

const USER_ID = `query-cost-${randomUUID()}`;
const TOURS = 150;
// The list query GET /api/tours runs (GetTours/index.js).
const LIST_QUERY =
  'SELECT c.id, c.name, c.description, c.distance, c.createdAt ' +
  'FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC';

const requests = [];
const client = new CosmosClient({
  connectionString: cosmosConnectionString,
  plugins: [
    {
      on: 'request',
      plugin: async (context, diagnosticNode, next) => {
        const response = await next(context);
        requests.push({
          operation: context.operationType,
          partitionKey: context.headers?.['x-ms-documentdb-partitionkey'],
          maxItemCount: context.headers?.['x-ms-max-item-count'],
          crossPartition: context.headers?.['x-ms-documentdb-query-enablecrosspartition'],
          ru: Number(response.headers?.['x-ms-request-charge'] ?? 0),
        });
        return response;
      },
    },
  ],
});
const tours = client.database(process.env.COSMOS_DATABASE ?? 'bikebuddy').container('tours');

beforeAll(async () => {
  for (let index = 0; index < TOURS; index++) {
    await tours.items.create({
      id: randomUUID(),
      userId: USER_ID,
      name: `Guard ride ${index}`,
      distance: index,
      createdAt: new Date(Date.UTC(2025, 0, 1 + index)).toISOString(),
      heatmapData: [[48, 11]],
    });
  }
}, 120_000);

afterAll(async () => {
  const { resources } = await tours.items
    .query(
      {
        query: 'SELECT c.id FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: USER_ID }],
      },
      { partitionKey: USER_ID },
    )
    .fetchAll();
  for (const { id } of resources) await tours.item(id, USER_ID).delete();
}, 120_000);

describe('hot query guards', () => {
  it('the tour list is a single-partition query in bounded pages', async () => {
    requests.length = 0;
    const result = await queryUserItems(tours, { userId: USER_ID, query: LIST_QUERY });

    expect(result).toHaveLength(TOURS);
    const queries = requests.filter((request) => request.operation === 'query');
    // Every page targets the caller's partition; none asks for a cross-partition fan-out.
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      expect(query.partitionKey).toBe(JSON.stringify([USER_ID]));
      expect(query.crossPartition).not.toBe('true');
    }
    // At most ceil(150 / 100) pages; the emulator answers ORDER BY in one, real Cosmos pages it.
    for (const query of queries) expect(query.maxItemCount).toBe(MAX_ITEMS_PER_REQUEST);
    expect(queries.length).toBeLessThanOrEqual(Math.ceil(TOURS / MAX_ITEMS_PER_REQUEST));
    // Nominal on the emulator; a partition fan-out or a scan would multiply it.
    const requestCharge = queries.reduce((total, query) => total + query.ru, 0);
    expect(requestCharge).toBeLessThanOrEqual(10 * queries.length);
  });
});
