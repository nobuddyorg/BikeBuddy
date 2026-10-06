// @ts-check

// MSAL's codes for a request that never reached the identity provider: offline, not signed out.
const NETWORK_ERROR_CODES = new Set([
  'no_network_connectivity',
  'post_request_failed',
  'get_request_failed',
]);

/**
 * Whether only a sign-in gives a token again. Every MSAL error counts (an expired refresh token, a
 * silent iframe that timed out), except a network failure; anything else is a bug, not a session.
 *
 * @param {unknown} error
 */
export function needsSignIn(error) {
  const code = /** @type {{ errorCode?: unknown } | undefined} */ (error)?.errorCode;
  return typeof code === 'string' && !NETWORK_ERROR_CODES.has(code);
}

/**
 * The identity provider's answer carries `state`, in the fragment or the query; the app's own URLs
 * never do. Such a page load is the redirect bridge, not the app.
 *
 * @param {{ search: string, hash: string }} url
 */
export function hasAuthResponse({ search, hash }) {
  return [search, hash].some((part) => new URLSearchParams(part.slice(1)).has('state'));
}

/**
 * What a page load does once any redirect answer is handled. One silent (prompt=none) redirect
 * per tab renews a session the 24-hour refresh token, or a browser restart, has ended.
 *
 * @param {{ hasAccount: boolean, sessionUsable: boolean, wasSignedIn: boolean,
 *   silentSignInTried: boolean }} facts
 * @returns {'restore' | 'silent-sign-in' | 'session-ended' | 'signed-out'}
 */
export function startupStep({ hasAccount, sessionUsable, wasSignedIn, silentSignInTried }) {
  if (hasAccount && sessionUsable) return 'restore';
  if (wasSignedIn && !silentSignInTried) return 'silent-sign-in';
  return wasSignedIn || hasAccount ? 'session-ended' : 'signed-out';
}
