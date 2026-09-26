import { resolveAuthConfig } from '../lib/authConfig.js';
import { createAuthedFetch, createTokenSource } from '../lib/session.js';
import { announce, SESSION_EXPIRED } from './events.js';

const msal = window.msal;

// Set by the classic config.js <script>, which index.html loads before this module.
export const AUTH_CONFIG = resolveAuthConfig(window.BIKEBUDDY_CONFIG || {});
export const API_BASE = AUTH_CONFIG.apiBase;
export const LOGIN_REQUEST = { scopes: AUTH_CONFIG.loginScopes };

let msalClient;

export async function createAuthClient() {
  msalClient = new msal.PublicClientApplication({
    auth: {
      clientId: AUTH_CONFIG.clientId,
      authority: AUTH_CONFIG.authority,
      knownAuthorities: AUTH_CONFIG.knownAuthorities,
      redirectUri: window.location.origin + window.location.pathname,
    },
    // localStorage, not sessionStorage: the session survives closing the tab.
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
  });
  await msalClient.initialize();
  return msalClient;
}

async function acquireSilently({ forceRefresh }) {
  if (AUTH_CONFIG.useDevAuth || !msalClient) return '';
  const [account] = msalClient.getAllAccounts();
  if (!account) return '';
  const result = await msalClient.acquireTokenSilent({ ...LOGIN_REQUEST, account, forceRefresh });
  return result.accessToken;
}

const endSession = () => announce(SESSION_EXPIRED);
const tokens = createTokenSource({
  acquireSilently,
  needsInteraction: (error) => error instanceof msal.InteractionRequiredAuthError,
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
