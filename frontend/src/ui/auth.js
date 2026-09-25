import * as i18n from './i18n.js';
import { state } from './state.js';
import {
  hideElement,
  setVisible,
  signInButton,
  userMenu,
  uploadButton,
  profileButton,
  pinToggle,
  detailPanel,
  editModal,
  uploadModal,
  profileModal,
  helpModal,
  deleteAccountModal,
  statsModal,
} from './dom.js';
import { initials } from '../lib/format.js';
import { clearRouteLayer } from './routes.js';
import { clearPins } from './pins.js';
import { renderSidebar, loadTours } from './sidebar.js';
import { userFromAccount, userFromAuthResult } from '../lib/authConfig.js';
import { API_BASE, AUTH_CONFIG, LOGIN_REQUEST, apiRequest, createAuthClient } from './api.js';
import { toast } from './toast.js';

const t = i18n.t;

// MSAL's code for a sign-in popup the user closed.
const USER_CANCELLED = 'user_cancelled';

let msalClient;

// Dev mode has no session to clear, so an explicit sign-out is remembered here.
const DEV_SIGNED_OUT_KEY = 'bb-dev-signed-out';

const SYNTHETIC_USER = {
  id: 'local-dev-user',
  name: 'Local Dev',
  email: 'dev@localhost',
  createdAt: new Date().toISOString(),
};

// One-way: a user without a saved language keeps the active one until choosing in settings.
function syncLanguageFromUser(user) {
  if (user.language && user.language !== i18n.getLocale()) {
    i18n.setLanguage(user.language);
  }
}

async function devSignIn() {
  try {
    const response = await fetch(`${API_BASE}/api/me`);
    state.user = response.ok ? await response.json() : SYNTHETIC_USER;
  } catch {
    // Dev mode only: no backend to reach (the frontend alone, or opened from file://).
    state.user = SYNTHETIC_USER;
  }
  renderNavAuth();
  renderSidebar();
  const loading = loadTours();
  syncLanguageFromUser(state.user);
  await loading;
}

// Dev auth only. Storage can be blocked; the dev session then starts signed in.
function isDevSignedOut() {
  try {
    return Boolean(localStorage.getItem(DEV_SIGNED_OUT_KEY));
  } catch {
    return false;
  }
}

export async function initAuth() {
  if (AUTH_CONFIG.useDevAuth) {
    if (isDevSignedOut()) {
      renderNavAuth();
      return;
    }
    await devSignIn();
    return;
  }
  msalClient = await createAuthClient();
  const [account] = msalClient.getAllAccounts();
  if (!account) {
    renderNavAuth();
    return;
  }
  state.user = userFromAccount(account);
  await renderSignedIn();
}

export async function signIn() {
  if (AUTH_CONFIG.useDevAuth) {
    localStorage.removeItem(DEV_SIGNED_OUT_KEY);
    await devSignIn();
    return;
  }
  let result;
  try {
    result = await msalClient.loginPopup(LOGIN_REQUEST);
  } catch (error) {
    if (error.errorCode === USER_CANCELLED) return;
    console.error(error);
    toast(t('toast.signInError'), { type: 'error' });
    return;
  }
  state.user = userFromAuthResult(result);
  await renderSignedIn();
}

async function endProviderSession() {
  if (AUTH_CONFIG.useDevAuth) {
    localStorage.setItem(DEV_SIGNED_OUT_KEY, '1');
    return;
  }
  try {
    await msalClient.logoutPopup({ account: msalClient.getAllAccounts()[0] });
  } catch (error) {
    // The local session ends regardless; only the provider's cookie may outlive it.
    console.warn(error);
  }
}

export async function signOut() {
  await endProviderSession();
  state.user = null;
  state.tours = [];
  state.selectedTourId = null;
  clearRouteLayer();
  clearPins();
  hideElement(pinToggle);
  hideElement(detailPanel);
  [editModal, uploadModal, profileModal, helpModal, deleteAccountModal, statsModal].forEach(
    hideElement,
  );
  renderSidebar();
  renderNavAuth();
}

// Renders before awaiting, so the Sign In prompt never lingers behind the tours request.
async function renderSignedIn() {
  state.loadingTours = true;
  renderNavAuth();
  renderSidebar();
  await Promise.all([loadTours(), refreshUser()]);
}

// Token claims can lack the name right after sign-up; a failure keeps the token's values.
export async function refreshUser() {
  const { response, networkError } = await apiRequest('/api/me');
  if (networkError) return;
  if (!response.ok) {
    console.warn(`GET /api/me answered ${response.status}`);
    return;
  }
  state.user = { ...state.user, ...(await response.json()) };
  renderNavAuth();
  syncLanguageFromUser(state.user);
}

export function renderNavAuth() {
  const signedIn = !!state.user;
  setVisible(signInButton, !signedIn);
  setVisible(userMenu, signedIn);
  uploadButton.disabled = !signedIn;
  if (!signedIn) {
    uploadButton.title = t('nav.uploadDisabledTitle');
    return;
  }
  uploadButton.removeAttribute('title');
  profileButton.textContent = initials(state.user.name || state.user.email);
  profileButton.classList.add('btn-avatar');
  profileButton.title = state.user.name || state.user.email || t('common.account');
}
