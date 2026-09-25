'use strict';

const { updateProfile } = require('./index');
const { fakeUsersContainer, cosmosError } = require('../../test/fakes/cosmosContainer');
const { signedInAs, signedOut, fixedClock, NOW } = require('../../test/fakes/collaborators');

const INVALID = 'errors.profileInvalid';
const STORED = { id: 'u1', name: null, email: 'ada@example.com', createdAt: 'x' };
const OTHER_USER = { id: 'u2', name: 'Grace', email: 'grace@example.com', createdAt: 'y' };

function setUp({
  profiles = [STORED, OTHER_USER],
  authenticate = signedInAs('u1', { userEmail: 'ada@example.com' }),
} = {}) {
  const users = fakeUsersContainer(profiles);
  const run = (json) =>
    updateProfile({ json }, { authenticate, usersContainer: () => users, now: fixedClock });
  const withBody = (body) => async () => body;
  const writes = () => users.calls.filter((call) => call.operation !== 'read');
  return { users, run, withBody, writes };
}

describe('PATCH /api/me', () => {
  it('stores the chosen name and returns the profile', async () => {
    const { users, run, withBody } = setUp();

    const response = await run(withBody({ name: 'Ada Lovelace' }));

    expect(response.status).toBe(200);
    expect(response.jsonBody).toStrictEqual({
      id: 'u1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      createdAt: 'x',
      language: undefined,
    });
    expect(users.stored('u1', 'u1').name).toBe('Ada Lovelace');
  });

  it('strips HTML from the name', async () => {
    const { run, withBody } = setUp();

    expect((await run(withBody({ name: '<b>Ada</b>' }))).jsonBody.name).toBe('bAda/b');
  });

  it('stores the language, leaving the name untouched', async () => {
    const { users, run, withBody } = setUp({ profiles: [{ ...STORED, name: 'Ada' }] });

    const response = await run(withBody({ language: 'de' }));

    expect(response.jsonBody).toMatchObject({ name: 'Ada', language: 'de' });
    expect(users.stored('u1', 'u1')).toMatchObject({ name: 'Ada', language: 'de' });
  });

  it('stores the name, leaving the language untouched', async () => {
    const { users, run, withBody } = setUp({ profiles: [{ ...STORED, language: 'de' }] });

    await run(withBody({ name: 'New Name' }));

    expect(users.stored('u1', 'u1')).toMatchObject({ name: 'New Name', language: 'de' });
  });

  it('creates the profile when GET /api/me has not run yet', async () => {
    const { users, run, withBody } = setUp({ profiles: [] });

    const response = await run(withBody({ language: 'fr' }));

    expect(response.status).toBe(200);
    expect(users.stored('u1', 'u1')).toMatchObject({
      id: 'u1',
      name: null,
      email: 'ada@example.com',
      language: 'fr',
      createdAt: NOW.toISOString(),
    });
  });

  it('writes to the token user only, ignoring an id or email in the body', async () => {
    const { users, run, withBody } = setUp();

    await run(withBody({ name: 'Ada', id: 'u2', email: 'attacker@example.com', userId: 'u2' }));

    expect(users.stored('u1', 'u1')).toMatchObject({ name: 'Ada', email: 'ada@example.com' });
    expect(users.stored('u2', 'u2')).toEqual(expect.objectContaining(OTHER_USER));
    expect(users.calls.map(({ operation, id }) => [operation, id])).toEqual([
      ['read', 'u1'],
      ['upsert', 'u1'],
    ]);
  });

  it.each([
    ['an empty name', { name: '   ' }],
    ['an unsupported language', { language: 'xx' }],
    ['neither name nor language', {}],
    ['a JSON null', null],
  ])('returns 400 for %s, writing nothing', async (_label, body) => {
    const { run, withBody, writes } = setUp();

    const response = await run(withBody(body));

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe(INVALID);
    expect(writes()).toEqual([]);
  });

  it('returns 400 for a body that is not JSON, writing nothing', async () => {
    const { users, run } = setUp();

    const response = await run(async () => JSON.parse('{"name": '));

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe(INVALID);
    expect(users.calls).toEqual([]);
  });

  it('rethrows a body read failure that is not malformed JSON', async () => {
    const { run } = setUp();

    await expect(
      run(async () => {
        throw new TypeError('body stream already read');
      }),
    ).rejects.toThrow('body stream already read');
  });

  it('re-throws read errors other than 404', async () => {
    const { users, run, withBody } = setUp();
    users.failOn('read', { error: cosmosError(503, 'Service unavailable') });

    await expect(run(withBody({ name: 'Ada' }))).rejects.toThrow('Service unavailable');
  });

  it('returns 401 without reading or writing when the caller is not signed in', async () => {
    const { users, run, withBody } = setUp({ authenticate: signedOut });

    const response = await run(withBody({ name: 'Ada' }));

    expect(response.status).toBe(401);
    expect(users.calls).toEqual([]);
  });
});
