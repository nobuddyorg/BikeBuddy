'use strict';

import * as i18n from '../lib/i18n.js';
import { state } from './state.js';
import { show, elBtnLogin, elUserMenu, elBtnUpload, elBtnProfile } from './dom.js';
import {
  elPinToggle,
  elDetailPanel,
  elEditModal,
  elUploadModal,
  elProfileModal,
  elHelpModal,
  elDeleteAccountModal,
} from './dom.js';
import { initials } from '../lib/format.js';
import { clearRouteLayer } from './routes.js';
import { clearPins } from './pins.js';
import { renderSidebar, loadTours } from './sidebar.js';

const t = i18n.t;
const msal = window.msal;

// Set by the classic <script> in index.html, loaded before this module.
const BIKEBUDDY_CONFIG = window.BIKEBUDDY_CONFIG || {};

let msalClient;

const LOGIN_SCOPES = {
  scopes: [
    'openid',
    'profile',
    ...(BIKEBUDDY_CONFIG.entraApiScope ? [BIKEBUDDY_CONFIG.entraApiScope] : []),
  ],
};

// Pairs with the backend's SKIP_AUTH, so the app also works before a tenant is
// configured and flips to real auth the moment one is.
const USE_DEV_AUTH =
  BIKEBUDDY_CONFIG.devMode || !(BIKEBUDDY_CONFIG.entraSubdomain && BIKEBUDDY_CONFIG.entraClientId);

// Dev mode has no session to clear, so an explicit sign-out is remembered here.
const DEV_SIGNED_OUT_KEY = 'bb-dev-signed-out';

// Fallback for when the backend isn't reachable at all (frontend opened from
// file://); with it running, dev sign-in goes through the real /api/me.
const SYNTHETIC_USER = {
  id: 'local-dev-user',
  name: 'Local Dev',
  email: 'dev@localhost',
  createdAt: new Date().toISOString(),
};

// One-way on purpose: a user with no saved language keeps the active locale
// until they pick one in settings, rather than having it written back.
export function syncLanguageFromUser(user) {
  if (user.language && user.language !== i18n.getLocale()) {
    i18n.setLanguage(user.language);
  }
}

async function devSignIn() {
  try {
    const res = await fetch(`${API_BASE}/api/me`);
    state.user = res.ok ? await res.json() : SYNTHETIC_USER;
  } catch {
    state.user = SYNTHETIC_USER;
  }
  renderNavAuth();
  renderSidebar();
  loadTours();
  syncLanguageFromUser(state.user);
}

export async function initAuth() {
  if (USE_DEV_AUTH) {
    if (localStorage.getItem(DEV_SIGNED_OUT_KEY)) {
      renderNavAuth();
      return;
    }
    await devSignIn();
    return;
  }
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

  const account = msalClient.getAllAccounts()[0];
  if (account) {
    setUserFromAccount(account);
  } else {
    renderNavAuth();
  }
}

function setUserFromAccount(account) {
  state.user = { id: account.homeAccountId, email: account.username || null };
  renderSignedIn();
}

export async function signIn() {
  if (USE_DEV_AUTH) {
    localStorage.removeItem(DEV_SIGNED_OUT_KEY);
    await devSignIn();
    return;
  }
  try {
    onAuthSuccess(await msalClient.loginPopup(LOGIN_SCOPES));
  } catch {
    // cancelled or blocked popup — no-op
  }
}

export async function signOut() {
  if (USE_DEV_AUTH) {
    localStorage.setItem(DEV_SIGNED_OUT_KEY, '1');
  } else {
    try {
      await msalClient.logoutPopup({ account: msalClient.getAllAccounts()[0] });
    } catch {
      // ignore logout errors
    }
  }
  state.user = null;
  state.tours = [];
  state.selectedTourId = null;
  clearRouteLayer();
  clearPins();
  show(elPinToggle, false);
  show(elDetailPanel, false);
  [elEditModal, elUploadModal, elProfileModal, elHelpModal, elDeleteAccountModal].forEach((m) =>
    show(m, false),
  );
  renderSidebar();
  renderNavAuth();
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

function onAuthSuccess(result) {
  state.user = {
    id: result.account.homeAccountId,
    email:
      result.idTokenClaims?.email ||
      result.idTokenClaims?.preferred_username ||
      result.account.username,
  };
  renderSignedIn();
}

// Renders before awaiting anything, so the Sign In prompt never lingers behind
// the tours request.
function renderSignedIn() {
  state.loadingTours = true;
  renderNavAuth();
  renderSidebar();
  loadTours();
  refreshUser();
}

// Token claims can be missing right after sign-up (name especially), so the
// user doc is merged in once loaded.
export async function refreshUser() {
  try {
    const res = await apiFetch('/api/me');
    if (!res.ok) return;
    state.user = { ...state.user, ...(await res.json()) };
    renderNavAuth();
    syncLanguageFromUser(state.user);
  } catch {
    // network unavailable — keep token-derived values
  }
}

export function renderNavAuth() {
  const signedIn = !!state.user;
  show(elBtnLogin, !signedIn);
  show(elUserMenu, signedIn);
  elBtnUpload.disabled = !signedIn;
  if (signedIn) {
    elBtnProfile.textContent = initials(state.user.name || state.user.email);
    elBtnProfile.classList.add('btn-avatar');
    elBtnProfile.title = state.user.name || state.user.email || t('common.account');
  }
}

export const API_BASE = BIKEBUDDY_CONFIG.apiBaseUrl || '';

export async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(API_BASE + path, { ...options, headers });
}
