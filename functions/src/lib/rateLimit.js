// @ts-check
'use strict';

const { ERROR_KEYS } = require('./http');

// A tour with its 20 photos is 21 uploads: five of those an hour, then one every 36 seconds.
const UPLOADS_PER_HOUR = 100;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const HOUR_MS = 60 * 60 * 1000;
// Past this many riders in one instance, the least recently seen is forgotten (a full bucket).
const MAX_TRACKED_KEYS = 10000;

/**
 * A token bucket per key, in this instance's memory: with several Flex instances a rider can get
 * up to that many times the rate, which maximum_instance_count bounds (#549).
 *
 * @param {{ capacity: number, refillIntervalMs: number, maxKeys?: number }} options
 */
function createRateLimiter({ capacity, refillIntervalMs, maxKeys = MAX_TRACKED_KEYS }) {
  const buckets = new Map();

  /**
   * Spends one token of `key`'s bucket at `nowMs`.
   *
   * @returns {{ allowed: true } | { allowed: false, retryAfterSeconds: number }}
   */
  function take(key, nowMs) {
    const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: nowMs };
    const tokens = Math.min(
      capacity,
      bucket.tokens + (nowMs - bucket.updatedAt) / refillIntervalMs,
    );
    buckets.delete(key);
    if (tokens < 1) {
      buckets.set(key, { tokens, updatedAt: nowMs });
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(((1 - tokens) * refillIntervalMs) / 1000),
      };
    }
    buckets.set(key, { tokens: tokens - 1, updatedAt: nowMs });
    if (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value);
    return { allowed: true };
  }

  return { take };
}

/**
 * The upload budget: `UPLOAD_RATE_LIMIT_PER_HOUR`, or 100. Only local stacks set it, since they run
 * every test as one dev user (scripts/development/start-backend.sh); a malformed value fails.
 *
 * @param {Record<string, string | undefined>} environment
 */
function uploadRateLimits(environment) {
  const configured = environment.UPLOAD_RATE_LIMIT_PER_HOUR;
  if (configured !== undefined && !POSITIVE_INTEGER.test(configured)) {
    throw new Error(`UPLOAD_RATE_LIMIT_PER_HOUR must be a positive integer, not "${configured}"`);
  }
  const perHour = configured === undefined ? UPLOADS_PER_HOUR : Number(configured);
  return { capacity: perHour, refillIntervalMs: HOUR_MS / perHour };
}

/**
 * @param {{ take: ReturnType<typeof createRateLimiter>['take'] }} limiter
 * @param {{ userId: string, now: Date }} request
 * @returns {object | null} the 429 to send, or null to carry on
 */
function refuseOverRate(limiter, { userId, now }) {
  const outcome = limiter.take(userId, now.getTime());
  if (outcome.allowed) return null;
  return {
    status: 429,
    headers: { 'Retry-After': String(outcome.retryAfterSeconds) },
    jsonBody: { error: ERROR_KEYS.rateLimited },
  };
}

module.exports = { UPLOADS_PER_HOUR, createRateLimiter, uploadRateLimits, refuseOverRate };
