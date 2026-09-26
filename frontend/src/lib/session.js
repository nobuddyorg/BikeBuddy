// @ts-check

const UNAUTHORIZED = 401;

// The message is an i18n key, so an upload that fails on it shows it translated.
export class SessionExpiredError extends Error {
  constructor() {
    super('errors.unauthorized');
    this.name = 'SessionExpiredError';
  }
}

/**
 * Tokens for API calls, never through a popup: outside a click a popup is blocked, and parallel ones
 * fail with interaction_in_progress. When only an interaction would do, the session has expired.
 *
 * @param {{
 *   acquireSilently: (options: { forceRefresh: boolean }) => Promise<string>,
 *   needsInteraction: (error: unknown) => boolean,
 *   onSessionExpired: () => void,
 * }} source
 */
export function createTokenSource({ acquireSilently, needsInteraction, onSessionExpired }) {
  let inFlight = null;
  const acquire = (forceRefresh) =>
    acquireSilently({ forceRefresh }).catch((error) => {
      if (!needsInteraction(error)) throw error;
      onSessionExpired();
      throw new SessionExpiredError();
    });
  return {
    // Parallel callers on page load share one silent request.
    token() {
      inFlight ??= acquire(false).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    freshToken: () => acquire(true),
  };
}

function withBearer(options, token) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { ...options, headers };
}

// What a caller gets instead of a request that could not be authorised: an ordinary 401 answer.
const expiredResponse = () =>
  new Response(JSON.stringify({ error: 'errors.unauthorized' }), {
    status: UNAUTHORIZED,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * fetch with a bearer token. A 401 gets one retry with a freshly acquired token; a second 401, or no
 * token without an interaction, ends the session so the UI can ask the user to sign in again.
 *
 * @param {{
 *   tokens: ReturnType<typeof createTokenSource>,
 *   fetch: (url: string, options: object) => Promise<Response>,
 *   onSessionExpired: () => void,
 * }} transport
 */
export function createAuthedFetch({ tokens, fetch, onSessionExpired }) {
  return async (url, options = {}) => {
    try {
      const response = await fetch(url, withBearer(options, await tokens.token()));
      if (response.status !== UNAUTHORIZED) return response;
      const retried = await fetch(url, withBearer(options, await tokens.freshToken()));
      if (retried.status === UNAUTHORIZED) onSessionExpired();
      return retried;
    } catch (error) {
      if (!(error instanceof SessionExpiredError)) throw error;
      return expiredResponse();
    }
  };
}
