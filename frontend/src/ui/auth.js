import * as i18n from './i18n.js';
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
  elStatsModal,
} from './dom.js';
import { initials } from '../lib/format.js';
import { clearRouteLayer } from './routes.js';
import { clearPins } from './pins.js';
import { renderSidebar, loadTours } from './sidebar.js';
import { userFromAccount, userFromAuthResult } from '../lib/authConfig.js';
import { API_BASE, AUTH_CONFIG, LOGIN_REQUEST, apiFetch, createAuthClient } from './api.js';

const t = i18n.t;

let msalClient;

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
function syncLanguageFromUser(user) {
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
  if (AUTH_CONFIG.useDevAuth) {
    if (localStorage.getItem(DEV_SIGNED_OUT_KEY)) {
      renderNavAuth();
      return;
    }
    await devSignIn();
    return;
  }
  msalClient = await createAuthClient();

  const account = msalClient.getAllAccounts()[0];
  if (account) {
    setUserFromAccount(account);
  } else {
    renderNavAuth();
  }
}

function setUserFromAccount(account) {
  state.user = userFromAccount(account);
  renderSignedIn();
}

export async function signIn() {
  if (AUTH_CONFIG.useDevAuth) {
    localStorage.removeItem(DEV_SIGNED_OUT_KEY);
    await devSignIn();
    return;
  }
  try {
    onAuthSuccess(await msalClient.loginPopup(LOGIN_REQUEST));
  } catch {
    // cancelled or blocked popup — no-op
  }
}

export async function signOut() {
  if (AUTH_CONFIG.useDevAuth) {
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
  [
    elEditModal,
    elUploadModal,
    elProfileModal,
    elHelpModal,
    elDeleteAccountModal,
    elStatsModal,
  ].forEach((m) => show(m, false));
  renderSidebar();
  renderNavAuth();
}

function onAuthSuccess(result) {
  state.user = userFromAuthResult(result);
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
  if (signedIn) elBtnUpload.removeAttribute('title');
  else elBtnUpload.title = t('nav.uploadDisabledTitle');
  if (signedIn) {
    elBtnProfile.textContent = initials(state.user.name || state.user.email);
    elBtnProfile.classList.add('btn-avatar');
    elBtnProfile.title = state.user.name || state.user.email || t('common.account');
  }
}
