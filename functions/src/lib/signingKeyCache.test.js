'use strict';

const {
  createSigningKeyCache,
  KEY_SET_TTL_MS,
  MIN_REFRESH_INTERVAL_MS,
  KEY_SET_MAX_STALENESS_MS,
} = require('./signingKeyCache');

const TENANT_KEYS = 'https://tenant.example/keys';
const MOVED_KEYS = 'https://tenant.example/moved-keys';

const signingKey = (kid) => ({ kid, getPublicKey: () => `pem-of-${kid}` });

function fakeClock() {
  let time = Date.UTC(2026, 0, 1);
  return { now: () => time, advance: (milliseconds) => (time += milliseconds) };
}

// Publishes the key ids per URI that the test sets; counts every fetch.
function fakeKeyEndpoint(published = { [TENANT_KEYS]: ['current'] }) {
  const endpoint = {
    published,
    failWith: undefined,
    fetchSigningKeys: vi.fn(async (jwksUri) => {
      if (endpoint.failWith) throw endpoint.failWith;
      return endpoint.published[jwksUri].map(signingKey);
    }),
  };
  return endpoint;
}

function cacheWith(endpoint = fakeKeyEndpoint(), clock = fakeClock()) {
  const cache = createSigningKeyCache({
    fetchSigningKeys: endpoint.fetchSigningKeys,
    now: clock.now,
  });
  return { cache, endpoint, clock };
}

const lookup = (cache, kid, jwksUri = TENANT_KEYS) => cache.getSigningKey({ jwksUri, kid });

describe('createSigningKeyCache — lookup', () => {
  test('fetches the key set once and resolves known kids from it', async () => {
    const { cache, endpoint } = cacheWith();

    const first = await lookup(cache, 'current');
    const second = await lookup(cache, 'current');

    expect(first.getPublicKey()).toBe('pem-of-current');
    expect(second).toBe(first);
    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(1);
    expect(endpoint.fetchSigningKeys).toHaveBeenCalledWith(TENANT_KEYS);
  });

  test('concurrent first lookups share one fetch', async () => {
    const { cache, endpoint } = cacheWith();

    await Promise.all([lookup(cache, 'current'), lookup(cache, 'current')]);

    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(1);
  });

  test('rejects an unknown kid as SigningKeyNotFoundError, naming the kid', async () => {
    const { cache } = cacheWith();

    await expect(lookup(cache, 'junk')).rejects.toMatchObject({
      name: 'SigningKeyNotFoundError',
      message: "No signing key matches kid 'junk'",
    });
  });

  test('rejects a token without a kid', async () => {
    const { cache } = cacheWith();
    await expect(lookup(cache, undefined)).rejects.toMatchObject({
      name: 'SigningKeyNotFoundError',
    });
  });
});

// #537: every unknown kid used to spend a JWKS fetch, until valid tokens could not get one.
describe('createSigningKeyCache — unknown kids cannot drain the key endpoint', () => {
  test('a burst of junk kids costs at most one extra fetch, and a valid kid still resolves', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');
    clock.advance(MIN_REFRESH_INTERVAL_MS);

    for (let index = 0; index < 50; index += 1) {
      await expect(lookup(cache, `junk-${index}`)).rejects.toThrow('No signing key matches');
    }

    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(2);
    expect((await lookup(cache, 'current')).kid).toBe('current');
  });

  test('on a cold cache, junk kids first still leave the valid kid resolvable', async () => {
    const { cache, endpoint } = cacheWith();

    for (let index = 0; index < 50; index += 1) {
      await expect(lookup(cache, `junk-${index}`)).rejects.toThrow('No signing key matches');
    }

    expect((await lookup(cache, 'current')).kid).toBe('current');
    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(1);
  });

  test('an unknown kid refetches once the interval has passed, not before', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');

    clock.advance(MIN_REFRESH_INTERVAL_MS - 1);
    await expect(lookup(cache, 'junk')).rejects.toThrow();
    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(1);

    clock.advance(1);
    await expect(lookup(cache, 'junk')).rejects.toThrow();
    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(2);
  });

  test('picks up a key the tenant rotated in since the last fetch', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');
    endpoint.published[TENANT_KEYS] = ['current', 'rotated'];
    clock.advance(MIN_REFRESH_INTERVAL_MS);

    expect((await lookup(cache, 'rotated')).kid).toBe('rotated');
  });

  // Not a 401: the token may be fine, the endpoint is not.
  test('an unknown kid whose refetch fails propagates the fetch error', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');
    clock.advance(MIN_REFRESH_INTERVAL_MS);
    endpoint.failWith = new Error('getaddrinfo ENOTFOUND');

    await expect(lookup(cache, 'rotated')).rejects.toThrow('getaddrinfo ENOTFOUND');
  });

  test('a failed fetch still counts against the interval', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');
    clock.advance(MIN_REFRESH_INTERVAL_MS);
    endpoint.failWith = new Error('503');
    await expect(lookup(cache, 'junk')).rejects.toThrow('503');

    await expect(lookup(cache, 'junk')).rejects.toThrow('No signing key matches');
    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(2);
  });
});

describe('createSigningKeyCache — routine refresh', () => {
  test('refetches once the key set is an hour old, not before', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');

    clock.advance(KEY_SET_TTL_MS - 1);
    await lookup(cache, 'current');
    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(1);

    clock.advance(1);
    await lookup(cache, 'current');
    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(2);
  });

  test('drops a key the tenant retired at the next refresh', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');
    endpoint.published[TENANT_KEYS] = ['successor'];
    clock.advance(KEY_SET_TTL_MS);

    await expect(lookup(cache, 'current')).rejects.toThrow('No signing key matches');
  });

  test('a failed refresh keeps serving the cached set and logs why', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');
    clock.advance(KEY_SET_TTL_MS);
    endpoint.failWith = new Error('getaddrinfo ENOTFOUND');
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await lookup(cache, 'current')).kid).toBe('current');
      expect(logError).toHaveBeenCalledWith(
        'auth: signing key refresh failed, serving the cached set (getaddrinfo ENOTFOUND)',
      );
    } finally {
      logError.mockRestore();
    }
  });

  test('after a failed refresh, retries no sooner than the interval', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');
    clock.advance(KEY_SET_TTL_MS);
    endpoint.failWith = new Error('503');
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await lookup(cache, 'current');
      await lookup(cache, 'current');
      expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(2);

      clock.advance(MIN_REFRESH_INTERVAL_MS);
      await lookup(cache, 'current');
      expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(3);
    } finally {
      logError.mockRestore();
    }
  });

  test('stops serving the cached set after a day and propagates the fetch error', async () => {
    const { cache, endpoint, clock } = cacheWith();
    await lookup(cache, 'current');
    clock.advance(KEY_SET_MAX_STALENESS_MS);
    endpoint.failWith = new Error('503');

    await expect(lookup(cache, 'current')).rejects.toThrow('503');
  });

  test('a first fetch that fails propagates, and the next lookup tries again', async () => {
    const { cache, endpoint } = cacheWith();
    endpoint.failWith = new Error('503');
    await expect(lookup(cache, 'current')).rejects.toThrow('503');

    endpoint.failWith = undefined;
    expect((await lookup(cache, 'current')).kid).toBe('current');
  });
});

// #571: the client used to stay on the first jwks_uri it saw.
describe('createSigningKeyCache — a changed jwks_uri', () => {
  test('fetches the new URI and resolves kids from it', async () => {
    const endpoint = fakeKeyEndpoint({ [TENANT_KEYS]: ['current'], [MOVED_KEYS]: ['moved'] });
    const { cache } = cacheWith(endpoint);
    await lookup(cache, 'current');

    expect((await lookup(cache, 'moved', MOVED_KEYS)).kid).toBe('moved');
    expect(endpoint.fetchSigningKeys).toHaveBeenLastCalledWith(MOVED_KEYS);
    await expect(lookup(cache, 'current', MOVED_KEYS)).rejects.toThrow('No signing key matches');
  });

  test('never serves the old URI’s keys when the new one cannot be fetched', async () => {
    const { cache, endpoint } = cacheWith();
    await lookup(cache, 'current');
    endpoint.failWith = new Error('503');

    await expect(lookup(cache, 'current', MOVED_KEYS)).rejects.toThrow('503');
  });

  test('concurrent lookups for two URIs each resolve from their own key set', async () => {
    const endpoint = fakeKeyEndpoint({ [TENANT_KEYS]: ['current'], [MOVED_KEYS]: ['moved'] });
    const { cache } = cacheWith(endpoint);

    const [current, moved] = await Promise.all([
      lookup(cache, 'current'),
      lookup(cache, 'moved', MOVED_KEYS),
    ]);

    expect([current.kid, moved.kid]).toEqual(['current', 'moved']);
    expect(endpoint.fetchSigningKeys).toHaveBeenCalledTimes(2);
  });
});
