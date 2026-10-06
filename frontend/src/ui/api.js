import { resolveAuthConfig } from '../lib/authConfig.js';
import { needsSignIn } from '../lib/authFlow.js';
import { createAuthedFetch, createTokenSource } from '../lib/session.js';
import { announce, SESSION_EXPIRED } from './events.js';

const msal = window.msal;

// Set by the classic config.js <script>, which index.html loads before this module.
export const AUTH_CONFIG = resolveAuthConfig(window.BIKEBUDDY_CONFIG || {});
export const API_BASE = AUTH_CONFIG.apiBase;
export const LOGIN_REQUEST = { scopes: AUTH_CONFIG.loginScopes };

let msalClient;

export async function createAuthClient() {
  // The page itself, already registered in Entra; app.js makes it the redirect bridge too.
  const appUrl = window.location.origin + window.location.pathname;
  msalClient = new msal.PublicClientApplication({
    auth: {
      clientId: AUTH_CONFIG.clientId,
      authority: AUTH_CONFIG.authority,
      knownAuthorities: AUTH_CONFIG.knownAuthorities,
      redirectUri: appUrl,
      postLogoutRedirectUri: appUrl,
    },
    // localStorage, not sessionStorage: the session survives closing the tab (not the browser).
    cache: { cacheLocation: 'localStorage' },
  });
  await msalClient.initialize();
  return msalClient;
}

// Starts a cold Function App while the page loads; its answer carries nothing, so it is not awaited.
export function wakeApi() {
  if (AUTH_CONFIG.useDevAuth) return;
  fetch(`${API_BASE}/api/v1/health`).catch((error) => console.warn(error));
}

async function acquireSilently({ forceRefresh }) {
  if (AUTH_CONFIG.useDevAuth || !msalClient) return '';
  const [account] = msalClient.getAllAccounts();
  if (!account) return '';
  const result = await msalClient.acquireTokenSilent({ ...LOGIN_REQUEST, account, forceRefresh });
  return result.accessToken;
}

/**
 * Whether the cached session still gives a token, asked once on load. Offline counts as usable:
 * the requests that follow report it.
 */
export async function isSessionUsable() {
  try {
    await acquireSilently({ forceRefresh: false });
    return true;
  } catch (error) {
    if (needsSignIn(error)) return false;
    console.warn(error);
    return true;
  }
}

const endSession = () => announce(SESSION_EXPIRED);
const tokens = createTokenSource({
  acquireSilently,
  needsInteraction: needsSignIn,
  onSessionExpired: endSession,
});
const authedFetch = createAuthedFetch({
  tokens,
  fetch: (url, options) => fetch(url, options),
  onSessionExpired: endSession,
});

// Throws SessionExpiredError when only a sign-in would give one; each upload attempt asks anew.
export const getAccessToken = tokens.token;

// No response at all (offline, a blocked token popup) is its own outcome, not an exception.
export async function apiRequest(path, options = {}) {
  try {
    return { response: await apiFetch(path, options) };
  } catch (networkError) {
    console.error(networkError);
    return { networkError };
  }
}

export function apiFetch(path, options = {}) {
  return authedFetch(API_BASE + path, options);
}
