'use strict';

// Deterministic guards for the hot queries (docs/how-to/load-testing.md,
// "Deterministic guards"): load numbers drift between runs, these do not. Run
// against the Cosmos emulator with an SDK request plugin recording every
// request the query makes. The vnext emulator reports nominal request charges,
// so the RU bound only catches an order-of-magnitude change (e.g. a lost
// partition key fanning out); the shape assertions carry the weight.
const { randomUUID } = require('node:crypto');
const { CosmosClient } = require('@azure/cosmos');
const { queryUserItems, MAX_ITEMS_PER_REQUEST } = require('../../src/lib/db');

const USER_ID = `query-cost-${randomUUID()}`;
const TOURS = 150;
// The list query GET /api/tours runs (GetTours/index.js).
const LIST_QUERY =
  'SELECT c.id, c.name, c.description, c.distance, c.createdAt ' +
  'FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC';

const requests = [];
const client = new CosmosClient({
  connectionString: process.env.COSMOS_CONNECTION_STRING,
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
  for (let i = 0; i < TOURS; i++) {
    await tours.items.create({
      id: randomUUID(),
      userId: USER_ID,
      name: `Guard ride ${i}`,
      distance: i,
      createdAt: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(),
      heatmapData: [[48, 11]],
    });
  }
}, 120_000);

afterAll(async () => {
  const { resources } = await tours.items
    .query(
      {
        query: 'SELECT c.id FROM c WHERE c.userId = @u',
        parameters: [{ name: '@u', value: USER_ID }],
      },
      { partitionKey: USER_ID },
    )
    .fetchAll();
  for (const { id } of resources) await tours.item(id, USER_ID).delete();
}, 120_000);

describe('hot query guards', () => {
  it('the tour list is a single-partition query in bounded pages', async () => {
    requests.length = 0;
    const result = await queryUserItems(tours, USER_ID, LIST_QUERY);

    expect(result).toHaveLength(TOURS);
    const queries = requests.filter((r) => r.operation === 'query');
    // Every page targets the caller's partition; none asks for a cross-partition fan-out.
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      expect(query.partitionKey).toBe(JSON.stringify([USER_ID]));
      expect(query.crossPartition).not.toBe('true');
    }
    // Bounded pages: every page asks for MAX_ITEMS_PER_REQUEST, so there are at most
    // ceil(150 / 100) round trips. (The emulator ignores the page size under ORDER BY
    // and answers in one page; real Cosmos honours it.)
    for (const query of queries) expect(query.maxItemCount).toBe(MAX_ITEMS_PER_REQUEST);
    expect(queries.length).toBeLessThanOrEqual(Math.ceil(TOURS / MAX_ITEMS_PER_REQUEST));
    // Nominal on the emulator; a partition fan-out or a scan would multiply it.
    expect(queries.reduce((total, q) => total + q.ru, 0)).toBeLessThanOrEqual(10 * queries.length);
  });
});
