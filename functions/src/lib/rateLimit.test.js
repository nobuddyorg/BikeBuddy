'use strict';

const {
  UPLOADS_PER_HOUR,
  createRateLimiter,
  uploadRateLimits,
  refuseOverRate,
} = require('./rateLimit');

const T0 = Date.parse('2026-09-26T10:00:00Z');

describe('createRateLimiter', () => {
  it('allows a full bucket in a burst, then refuses with the wait for the next token', () => {
    const limiter = createRateLimiter({ capacity: 3, refillIntervalMs: 10_000 });

    expect([1, 2, 3].map(() => limiter.take('u1', T0))).toEqual([
      { allowed: true },
      { allowed: true },
      { allowed: true },
    ]);
    expect(limiter.take('u1', T0)).toEqual({ allowed: false, retryAfterSeconds: 10 });
  });

  it('refills one token per interval, and the wait shrinks as it does', () => {
    const limiter = createRateLimiter({ capacity: 1, refillIntervalMs: 10_000 });
    limiter.take('u1', T0);

    expect(limiter.take('u1', T0 + 4_000)).toEqual({ allowed: false, retryAfterSeconds: 6 });
    expect(limiter.take('u1', T0 + 9_999)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.take('u1', T0 + 10_000)).toEqual({ allowed: true });
  });

  it('never refills past its capacity', () => {
    const limiter = createRateLimiter({ capacity: 2, refillIntervalMs: 1_000 });
    limiter.take('u1', T0);

    const later = T0 + 60_000;
    expect([1, 2, 3].map(() => limiter.take('u1', later).allowed)).toEqual([true, true, false]);
  });

  it('keeps one bucket per key', () => {
    const limiter = createRateLimiter({ capacity: 1, refillIntervalMs: 10_000 });
    limiter.take('u1', T0);

    expect(limiter.take('u2', T0)).toEqual({ allowed: true });
    expect(limiter.take('u1', T0).allowed).toBe(false);
  });

  it('forgets the least recently seen key past maxKeys, which then starts full', () => {
    const limiter = createRateLimiter({ capacity: 1, refillIntervalMs: 10_000, maxKeys: 2 });
    limiter.take('u1', T0);
    limiter.take('u2', T0);
    expect(limiter.take('u1', T0).allowed).toBe(false);

    limiter.take('u3', T0);

    expect(limiter.take('u2', T0)).toEqual({ allowed: true });
  });

  it('counts a refused attempt as seen, so it is not the one forgotten', () => {
    const limiter = createRateLimiter({ capacity: 1, refillIntervalMs: 10_000, maxKeys: 2 });
    limiter.take('u1', T0);
    limiter.take('u2', T0);
    limiter.take('u1', T0);

    limiter.take('u3', T0);

    expect(limiter.take('u1', T0).allowed).toBe(false);
  });
});

describe('uploadRateLimits', () => {
  it(`allows ${UPLOADS_PER_HOUR} uploads at once, then one every 36 seconds, by default`, () => {
    expect(UPLOADS_PER_HOUR).toBe(100);
    const limiter = createRateLimiter(uploadRateLimits({}));
    for (let upload = 0; upload < 100; upload++) {
      expect(limiter.take('rider', T0).allowed).toBe(true);
    }
    expect(limiter.take('rider', T0)).toEqual({ allowed: false, retryAfterSeconds: 36 });
    expect(limiter.take('rider', T0 + 36_000)).toEqual({ allowed: true });
  });

  it('takes the hourly budget from UPLOAD_RATE_LIMIT_PER_HOUR', () => {
    expect(uploadRateLimits({ UPLOAD_RATE_LIMIT_PER_HOUR: '3600' })).toEqual({
      capacity: 3600,
      refillIntervalMs: 1000,
    });
  });

  it.each(['', '0', '-5', '1.5', '10x', ' 10', '05'])(
    'refuses UPLOAD_RATE_LIMIT_PER_HOUR=%j',
    (value) => {
      expect(() => uploadRateLimits({ UPLOAD_RATE_LIMIT_PER_HOUR: value })).toThrow(
        `UPLOAD_RATE_LIMIT_PER_HOUR must be a positive integer, not "${value}"`,
      );
    },
  );
});

describe('refuseOverRate', () => {
  const NOW = new Date(T0);

  it('carries on while the limiter allows', () => {
    const limiter = { take: vi.fn(() => ({ allowed: true })) };

    expect(refuseOverRate(limiter, { userId: 'u1', now: NOW })).toBeNull();
    expect(limiter.take).toHaveBeenCalledWith('u1', T0);
  });

  it('answers 429 with Retry-After and errors.rateLimited once it refuses', () => {
    const limiter = { take: () => ({ allowed: false, retryAfterSeconds: 12 }) };

    expect(refuseOverRate(limiter, { userId: 'u1', now: NOW })).toEqual({
      status: 429,
      headers: { 'Retry-After': '12' },
      jsonBody: { error: 'errors.rateLimited' },
    });
  });
});
