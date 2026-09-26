import { describe, it, expect, vi } from 'vitest';
import { createTokenSource, createAuthedFetch, SessionExpiredError } from '../src/lib/session.js';

const interactionRequired = Object.assign(new Error('refresh token expired'), {
  interaction: true,
});
const needsInteraction = (error) => error?.interaction === true;

function tokenSource({ tokens = ['token-1'], onSessionExpired = vi.fn() } = {}) {
  const queue = [...tokens];
  const acquireSilently = vi.fn(async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return {
    acquireSilently,
    onSessionExpired,
    tokens: createTokenSource({ acquireSilently, needsInteraction, onSessionExpired }),
  };
}

const answer = (status) => new Response('{}', { status });

describe('createTokenSource', () => {
  it('asks silently, and shares one request between parallel callers', async () => {
    const { tokens, acquireSilently } = tokenSource();

    const [first, second] = await Promise.all([tokens.token(), tokens.token()]);

    expect([first, second]).toEqual(['token-1', 'token-1']);
    expect(acquireSilently).toHaveBeenCalledTimes(1);
    expect(acquireSilently).toHaveBeenCalledWith({ forceRefresh: false });
  });

  it('asks again once the shared request has settled', async () => {
    const { tokens, acquireSilently } = tokenSource({ tokens: ['token-1', 'token-2'] });

    await tokens.token();

    expect(await tokens.token()).toBe('token-2');
    expect(acquireSilently).toHaveBeenCalledTimes(2);
  });

  it('forces a refresh for a fresh token', async () => {
    const { tokens, acquireSilently } = tokenSource();

    await tokens.freshToken();

    expect(acquireSilently).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it('ends the session instead of opening a popup when only an interaction would help', async () => {
    const { tokens, onSessionExpired } = tokenSource({ tokens: [interactionRequired] });

    const error = await tokens.token().catch((failure) => failure);

    expect(error).toBeInstanceOf(SessionExpiredError);
    expect(error.name).toBe('SessionExpiredError');
    expect(error.message).toBe('errors.unauthorized');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('passes any other failure on, the session intact', async () => {
    const offline = new Error('network down');
    const { tokens, onSessionExpired } = tokenSource({ tokens: [offline] });

    await expect(tokens.token()).rejects.toBe(offline);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});

describe('createAuthedFetch', () => {
  function transport({ tokens = ['token-1', 'token-2'], statuses = [200] } = {}) {
    const source = tokenSource({ tokens });
    const onSessionExpired = vi.fn();
    const remaining = [...statuses];
    const fetch = vi.fn(async () => answer(remaining.shift()));
    const authedFetch = createAuthedFetch({ tokens: source.tokens, fetch, onSessionExpired });
    return { authedFetch, fetch, onSessionExpired, source };
  }

  it("sends the token as a bearer, keeping the caller's headers", async () => {
    const { authedFetch, fetch } = transport();

    const response = await authedFetch('/api/tours', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/tours', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    });
  });

  it('sends no Authorization header without a token (dev mode)', async () => {
    const { authedFetch, fetch } = transport({ tokens: [''] });

    await authedFetch('/api/tours');

    expect(fetch).toHaveBeenCalledWith('/api/tours', { headers: {} });
  });

  it('retries a 401 once with a freshly acquired token', async () => {
    const { authedFetch, fetch, onSessionExpired, source } = transport({ statuses: [401, 200] });

    const response = await authedFetch('/api/tours');

    expect(response.status).toBe(200);
    expect(fetch.mock.calls.map(([, options]) => options.headers.Authorization)).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ]);
    expect(source.acquireSilently).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('ends the session when the fresh token is refused too', async () => {
    const { authedFetch, fetch, onSessionExpired } = transport({ statuses: [401, 401] });

    const response = await authedFetch('/api/tours');

    expect(response.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('answers 401 without a request when no token comes without an interaction', async () => {
    const { authedFetch, fetch } = transport({ tokens: [interactionRequired] });

    const response = await authedFetch('/api/tours');

    expect(response.status).toBe(401);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(await response.json()).toEqual({ error: 'errors.unauthorized' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes a network failure on as it is', async () => {
    const source = tokenSource();
    const offline = new TypeError('Failed to fetch');
    const authedFetch = createAuthedFetch({
      tokens: source.tokens,
      fetch: async () => Promise.reject(offline),
      onSessionExpired: vi.fn(),
    });

    await expect(authedFetch('/api/tours')).rejects.toBe(offline);
  });
});
