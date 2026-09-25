import { resolveAuthConfig } from '../lib/authConfig.js';

const msal = window.msal;

// BIKEBUDDY_CONFIG is set by the classic config.js <script>, loaded before this module.
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
    // localStorage, not sessionStorage: survives tab close/reopen.
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
  });
  await msalClient.initialize();
  return msalClient;
}

export async function getAccessToken() {
  if (AUTH_CONFIG.useDevAuth) return null;
  const account = msalClient.getAllAccounts()[0];
  if (!account) return null;
  try {
    return (await msalClient.acquireTokenSilent({ ...LOGIN_REQUEST, account })).accessToken;
  } catch {
    return (await msalClient.acquireTokenPopup({ ...LOGIN_REQUEST, account })).accessToken;
  }
}

export async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(API_BASE + path, { ...options, headers });
}
