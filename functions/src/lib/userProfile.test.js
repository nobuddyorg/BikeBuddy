'use strict';

const {
  profileFromClaims,
  missingProfileFields,
  newUserDocument,
  toUserResponse,
} = require('./userProfile');

describe('profileFromClaims', () => {
  it('passes plain claims through', () => {
    expect(profileFromClaims({ userName: 'Ada', userEmail: 'ada@example.com' })).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
    });
  });

  it('strips HTML and surrounding whitespace like a typed name', () => {
    expect(
      profileFromClaims({ userName: '  <b>Ada</b> ', userEmail: '<ada@example.com>' }),
    ).toEqual({ name: 'bAda/b', email: 'ada@example.com' });
  });

  it('cuts an over-long claim to 200 characters instead of refusing it', () => {
    const { name } = profileFromClaims({ userName: 'a'.repeat(250), userEmail: null });
    expect(name).toBe('a'.repeat(200));
  });

  it('trims what the cut leaves at the end', () => {
    const { name } = profileFromClaims({ userName: `${'a'.repeat(199)} b`, userEmail: null });
    expect(name).toBe('a'.repeat(199));
  });

  it('reports a missing, non-string or empty claim as null', () => {
    expect(profileFromClaims({})).toEqual({ name: null, email: null });
    expect(profileFromClaims({ userName: 42, userEmail: ['a@b.c'] })).toEqual({
      name: null,
      email: null,
    });
    expect(profileFromClaims({ userName: '<>', userEmail: '   ' })).toEqual({
      name: null,
      email: null,
    });
  });
});

describe('missingProfileFields', () => {
  const claims = { name: 'Token Name', email: 'token@example.com' };

  it('fills only the fields the stored document leaves empty', () => {
    expect(missingProfileFields({ stored: { name: null, email: '' }, claims })).toEqual(claims);
    expect(
      missingProfileFields({ stored: { name: '  ', email: 'kept@example.com' }, claims }),
    ).toEqual({ name: 'Token Name' });
    expect(missingProfileFields({ stored: {}, claims })).toEqual(claims);
  });

  it('never overwrites a value the user set', () => {
    expect(
      missingProfileFields({ stored: { name: 'Chosen', email: 'chosen@example.com' }, claims }),
    ).toEqual({});
  });

  it('has nothing to fill from a claim that is absent', () => {
    expect(
      missingProfileFields({
        stored: { name: null, email: null },
        claims: { name: null, email: null },
      }),
    ).toEqual({});
  });
});

describe('newUserDocument', () => {
  it('builds the first document of a user from their claims', () => {
    expect(
      newUserDocument({
        userId: 'u1',
        profile: { name: 'Ada', email: null },
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      }),
    ).toEqual({
      id: 'u1',
      schemaVersion: 1,
      name: 'Ada',
      email: null,
      createdAt: '2026-03-01T12:00:00.000Z',
    });
  });
});

describe('toUserResponse', () => {
  it('projects the profile fields and nothing else', () => {
    const stored = {
      id: 'u1',
      name: 'Ada',
      email: 'ada@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      language: 'de',
      _rid: 'x',
      _etag: '"1"',
      _ts: 1,
    };
    expect(toUserResponse(stored)).toStrictEqual({
      id: 'u1',
      name: 'Ada',
      email: 'ada@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      language: 'de',
    });
  });
});
