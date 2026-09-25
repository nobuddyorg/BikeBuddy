const msal = window.msal;

// Set by the classic <script> in index.html, loaded before this module.
const BIKEBUDDY_CONFIG = window.BIKEBUDDY_CONFIG || {};

export const API_BASE = BIKEBUDDY_CONFIG.apiBaseUrl || '';

export const LOGIN_SCOPES = {
  scopes: [
    'openid',
    'profile',
    ...(BIKEBUDDY_CONFIG.entraApiScope ? [BIKEBUDDY_CONFIG.entraApiScope] : []),
  ],
};

// Pairs with the backend's SKIP_AUTH, so the app also works before a tenant is
// configured and flips to real auth the moment one is.
export const USE_DEV_AUTH =
  BIKEBUDDY_CONFIG.devMode || !(BIKEBUDDY_CONFIG.entraSubdomain && BIKEBUDDY_CONFIG.entraClientId);

let msalClient;

export async function createAuthClient() {
  // Microsoft Entra External ID authority: https://<subdomain>.ciamlogin.com/
  const subdomain = BIKEBUDDY_CONFIG.entraSubdomain;
  msalClient = new msal.PublicClientApplication({
    auth: {
      clientId: BIKEBUDDY_CONFIG.entraClientId,
      authority: `https://${subdomain}.ciamlogin.com/`,
      knownAuthorities: [`${subdomain}.ciamlogin.com`],
      redirectUri: window.location.origin + window.location.pathname,
    },
    // localStorage, not sessionStorage: survives tab close/reopen.
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
  });
  await msalClient.initialize();
  return msalClient;
}

export async function getAccessToken() {
  if (USE_DEV_AUTH) return null;
  const account = msalClient.getAllAccounts()[0];
  if (!account) return null;
  try {
    return (await msalClient.acquireTokenSilent({ ...LOGIN_SCOPES, account })).accessToken;
  } catch {
    return (await msalClient.acquireTokenPopup({ ...LOGIN_SCOPES, account })).accessToken;
  }
}

export async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(API_BASE + path, { ...options, headers });
}
