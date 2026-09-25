'use strict';

const { getMe } = require('./index');
const { fakeUsersContainer, cosmosError } = require('../../test/fakes/cosmosContainer');
const { signedInAs, signedOut, fixedClock, NOW } = require('../../test/fakes/collaborators');

const CLAIMS = { userName: 'Ada', userEmail: 'ada@example.com' };
const STORED = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const OTHER_USER = { id: 'u2', name: 'Grace', email: 'grace@example.com', createdAt: 'x' };

function setUp({
  profiles = [STORED, OTHER_USER],
  authenticate = signedInAs('u1', CLAIMS),
  queued = [],
} = {}) {
  const users = fakeUsersContainer(profiles);
  const deletions = fakeUsersContainer(queued);
  const run = () =>
    getMe(
      {},
      {
        authenticate,
        usersContainer: () => users,
        deletionsContainer: () => deletions,
        now: fixedClock,
      },
    );
  const writes = () => users.calls.filter((call) => call.operation !== 'read');
  return { users, run, writes };
}

describe('GET /api/me', () => {
  it('returns the stored profile without storage fields', async () => {
    const { run, writes } = setUp();

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.jsonBody).toStrictEqual({ ...STORED, language: undefined });
    expect(writes()).toEqual([]);
  });

  it('returns the language the user chose', async () => {
    const { run } = setUp({ profiles: [{ ...STORED, language: 'de' }] });

    expect((await run()).jsonBody.language).toBe('de');
  });

  it("reads the token user's own profile only", async () => {
    const { users, run } = setUp({ authenticate: signedInAs('u2', CLAIMS) });

    const response = await run();

    expect(response.jsonBody.name).toBe('Grace');
    expect(users.calls).toEqual([{ operation: 'read', id: 'u2', partitionKey: 'u2' }]);
  });

  it('creates the profile from the token on first sign-in', async () => {
    const { users, run } = setUp({ profiles: [] });

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({
      id: 'u1',
      name: 'Ada',
      email: 'ada@example.com',
      createdAt: NOW.toISOString(),
    });
    expect(users.stored('u1', 'u1')).toMatchObject({ name: 'Ada', createdAt: NOW.toISOString() });
  });

  it('creates the profile when the read throws a 404, as real Cosmos does', async () => {
    const { users, run } = setUp({ profiles: [] });
    users.failOn('read', { error: cosmosError(404, 'Not found') });

    expect((await run()).status).toBe(200);
    expect(users.stored('u1', 'u1')).toBeDefined();
  });

  it('returns the profile a concurrent first request created instead of failing', async () => {
    const { users, run } = setUp({ profiles: [] });
    const winner = { ...STORED, name: 'Created first' };
    users.beforeNext('create', () => users.seed(winner));

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.jsonBody.name).toBe('Created first');
    expect(users.stored('u1', 'u1').name).toBe('Created first');
  });

  it('cleans token claims like a typed name before storing them', async () => {
    const { users, run } = setUp({
      profiles: [],
      authenticate: signedInAs('u1', { userName: `<b>${'a'.repeat(250)}`, userEmail: '  ' }),
    });

    await run();

    expect(users.stored('u1', 'u1')).toMatchObject({ name: `b${'a'.repeat(199)}`, email: null });
  });

  it('backfills an empty name and email once the token carries them', async () => {
    const { users, run } = setUp({ profiles: [{ ...STORED, name: null, email: '' }] });

    const response = await run();

    expect(response.jsonBody).toMatchObject({ name: 'Ada', email: 'ada@example.com' });
    expect(users.stored('u1', 'u1')).toMatchObject({ name: 'Ada', email: 'ada@example.com' });
  });

  it('never overwrites a name or email the user set with the token values (#551)', async () => {
    const chosen = { ...STORED, name: 'Chosen Name', email: 'chosen@example.com' };
    const { users, run, writes } = setUp({
      profiles: [chosen],
      authenticate: signedInAs('u1', { userName: 'Token Name', userEmail: 'token@example.com' }),
    });

    const response = await run();

    expect(response.jsonBody).toMatchObject({ name: 'Chosen Name', email: 'chosen@example.com' });
    expect(users.stored('u1', 'u1')).toMatchObject({ name: 'Chosen Name' });
    expect(writes()).toEqual([]);
  });

  it('fills only the empty field, keeping the one the user set', async () => {
    const { users, run } = setUp({ profiles: [{ ...STORED, name: 'Chosen Name', email: null }] });

    await run();

    expect(users.stored('u1', 'u1')).toMatchObject({
      name: 'Chosen Name',
      email: 'ada@example.com',
    });
  });

  it('keeps a name the user chose while the backfill was in flight', async () => {
    const { users, run } = setUp({ profiles: [{ ...STORED, name: null }] });
    users.beforeNext('replace', () => users.seed({ ...STORED, name: 'Just chosen' }));

    const response = await run();

    expect(response.jsonBody.name).toBe('Just chosen');
    expect(users.stored('u1', 'u1').name).toBe('Just chosen');
  });

  it('answers with the profile as read when it vanished during a conflicting backfill', async () => {
    const { users, run } = setUp({ profiles: [{ ...STORED, name: null }] });
    users.failOn('replace', { error: cosmosError(412, 'Precondition failed') });
    users.beforeNext('replace', () => users.item('u1', 'u1').delete());

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.jsonBody.name).toBeNull();
  });

  it('re-throws a failed backfill that is not a conflict', async () => {
    const { users, run } = setUp({ profiles: [{ ...STORED, name: null }] });
    users.failOn('replace', { error: cosmosError(503, 'Service unavailable') });

    await expect(run()).rejects.toThrow('Service unavailable');
  });

  it('re-throws read errors other than 404', async () => {
    const { users, run } = setUp();
    users.failOn('read', { error: cosmosError(503, 'Service unavailable') });

    await expect(run()).rejects.toThrow('Service unavailable');
  });

  it('re-throws a failed create that is not a conflict', async () => {
    const { users, run } = setUp({ profiles: [] });
    users.failOn('create', { error: cosmosError(503, 'Service unavailable') });

    await expect(run()).rejects.toThrow('Service unavailable');
  });

  it('returns 401 without reading or writing when the caller is not signed in', async () => {
    const { users, run } = setUp({ authenticate: signedOut });

    const response = await run();

    expect(response.status).toBe(401);
    expect(users.calls).toEqual([]);
  });

  // Signing in again before the deletion job ran must not recreate what nothing would delete.
  it('answers 410 and creates no profile while the account deletion is queued', async () => {
    const { run, writes } = setUp({
      profiles: [],
      authenticate: signedInAs('u1', { ...CLAIMS, userOid: 'oid-1' }),
      queued: [{ id: 'oid-1', userId: 'u1' }],
    });

    const response = await run();

    expect(response).toEqual({ status: 410, jsonBody: { error: 'errors.accountDeleted' } });
    expect(writes()).toEqual([]);
  });
});
