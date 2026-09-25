'use strict';

// Every authenticated route refuses every credential it must: 401, and nothing written.

const { randomUUID } = require('node:crypto');
const { connectHarness } = require('./harness');
const { AUTHENTICATED_ENDPOINTS, named } = require('./endpoints');
const { ownerView } = require('./views');
const { geotaggedJpeg } = require('../fixtures/jpegs');

const HEADER_CREDENTIALS = {
  'no Authorization header': {},
  'a Basic scheme': { Authorization: `Basic ${Buffer.from('rider:password').toString('base64')}` },
  'a bearer value that is not a JWT': { Authorization: 'Bearer not-a-jwt' },
};
// Labels of tokens.js's rejectedTokensFor, pinned below so a new flaw cannot skip this matrix.
const TOKEN_FLAWS = [
  'expired',
  'not valid yet',
  'wrong audience',
  'wrong issuer',
  'signed by another key',
  'alg none',
  'HS256 keyed with the public key',
];
const WRITES = AUTHENTICATED_ENDPOINTS.filter(({ method }) => method !== 'GET');

let harness;
let owner;
let target;
let before;

beforeAll(async () => {
  harness = await connectHarness();
  owner = harness.newUser();
  const jpeg = await geotaggedJpeg();
  const tourId = await owner.api.createTour({ name: `Token matrix ${randomUUID()}` });
  const image = await owner.api.addPhoto({ tourId, jpeg });
  target = { tourId, imageId: image.id, jpeg };
  before = await ownerView(owner.api, target);
}, 60_000);

afterAll(async () => {
  await owner?.api.deleteAccount();
});

// Each flawed token is the owner's own, aimed at the owner's own tour: only the flaw stops it.
function callerWith(credential) {
  if (credential in HEADER_CREDENTIALS) return harness.withHeaders(HEADER_CREDENTIALS[credential]);
  return harness.withToken(harness.tokens.rejectedTokensFor({ userId: owner.userId })[credential]);
}

test("the owner's own token reads the seeded tour, its photo and all three blobs", () => {
  expect(before.tour.images).toHaveLength(1);
  expect(before.blobStatuses).toEqual([200, 200, 200]);
});

test('the flawed tokens are the ones the harness mints', () => {
  expect(Object.keys(harness.tokens.rejectedTokensFor({ userId: owner.userId }))).toEqual(
    TOKEN_FLAWS,
  );
});

const CREDENTIALS = [
  ...Object.keys(HEADER_CREDENTIALS).map((credential) => [credential, credential]),
  ...TOKEN_FLAWS.map((flaw) => [`a token: ${flaw}`, flaw]),
];

describe.each(CREDENTIALS)('with %s', (_title, credential) => {
  test.each(named(AUTHENTICATED_ENDPOINTS))('%s answers 401', async (_name, endpoint) => {
    const response = await endpoint.send(callerWith(credential), target);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  test.each(named(WRITES))('%s changes nothing of the owner', async (_name, endpoint) => {
    expect((await endpoint.send(callerWith(credential), target)).status).toBe(401);

    expect(await ownerView(owner.api, target)).toEqual(before);
  });
});

test('a token signed under an unpublished key id answers 401', async () => {
  const token = harness.tokens.unknownKeyTokenFor({ userId: owner.userId });

  const response = await harness.withToken(token).request('/tours');

  expect(response.status).toBe(401);
  expect(await ownerView(owner.api, target)).toEqual(before);
});

test("the owner's own token still gets through after all of it", async () => {
  const response = await owner.api.request(`/tours/${target.tourId}`);
  expect(response.status).toBe(200);
});
