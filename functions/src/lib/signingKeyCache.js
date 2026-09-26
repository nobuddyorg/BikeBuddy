// @ts-check
'use strict';

const KEY_SET_TTL_MS = 60 * 60 * 1000;
// The only refetch a caller can cause: junk key ids cannot drain the key endpoint (#537).
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
// A failed routine refresh keeps the last good set this long, so a key endpoint blip is no outage.
const KEY_SET_MAX_STALENESS_MS = 24 * 60 * 60 * 1000;

/** @typedef {{ kid?: string, getPublicKey: () => string }} SigningKey */

// The name authenticate() answers 401 for: the token's fault, not the fetch's.
function keyNotFound(kid) {
  return Object.assign(new Error(`No signing key matches kid '${kid}'`), {
    name: 'SigningKeyNotFoundError',
  });
}

/**
 * The tenant's signing keys held locally and looked up by kid; the set follows a changed jwksUri.
 *
 * @param {{ fetchSigningKeys: (jwksUri: string) => Promise<SigningKey[]>, now: () => number }} collaborators
 */
function createSigningKeyCache({ fetchSigningKeys, now }) {
  /** @type {Map<string, { keysById: Map<string | undefined, SigningKey>, fetchedAt: number }>} */
  const keySetsByUri = new Map();
  /** @type {Map<string, Promise<void>>} */
  const pendingByUri = new Map();
  let lastAttemptAt = 0;

  const ageOf = (keySet) => now() - keySet.fetchedAt;
  const mayRefresh = () => now() - lastAttemptAt >= MIN_REFRESH_INTERVAL_MS;

  // Concurrent callers share one fetch.
  function refresh(jwksUri) {
    const inFlight = pendingByUri.get(jwksUri);
    if (inFlight) return inFlight;
    lastAttemptAt = now();
    const done = fetchSigningKeys(jwksUri)
      .then((keys) => {
        const keysById = new Map(keys.map((key) => [key.kid, key]));
        keySetsByUri.set(jwksUri, { keysById, fetchedAt: now() });
      })
      .finally(() => pendingByUri.delete(jwksUri));
    pendingByUri.set(jwksUri, done);
    return done;
  }

  async function refreshOrKeepStale(jwksUri) {
    try {
      await refresh(jwksUri);
    } catch (error) {
      const { message } = /** @type {Error} */ (error);
      console.error(`auth: signing key refresh failed, serving the cached set (${message})`);
    }
  }

  // Set by the refresh every caller awaits before looking a key up.
  const keysOf = (jwksUri) =>
    /** @type {{ keysById: Map<string | undefined, SigningKey> }} */ (keySetsByUri.get(jwksUri))
      .keysById;

  async function ensureCurrent(jwksUri) {
    const cached = keySetsByUri.get(jwksUri);
    if (!cached || ageOf(cached) >= KEY_SET_MAX_STALENESS_MS) await refresh(jwksUri);
    else if (ageOf(cached) >= KEY_SET_TTL_MS && mayRefresh()) await refreshOrKeepStale(jwksUri);
  }

  /**
   * @param {{ jwksUri: string, kid: string | undefined }} lookup
   * @returns {Promise<SigningKey>}
   */
  async function getSigningKey({ jwksUri, kid }) {
    await ensureCurrent(jwksUri);
    const key = keysOf(jwksUri).get(kid);
    if (key) return key;
    if (!mayRefresh()) throw keyNotFound(kid);

    // A key the tenant rotated in since the last fetch.
    await refresh(jwksUri);
    const rotatedKey = keysOf(jwksUri).get(kid);
    if (!rotatedKey) throw keyNotFound(kid);
    return rotatedKey;
  }

  return { getSigningKey };
}

module.exports = {
  createSigningKeyCache,
  KEY_SET_TTL_MS,
  MIN_REFRESH_INTERVAL_MS,
  KEY_SET_MAX_STALENESS_MS,
};
