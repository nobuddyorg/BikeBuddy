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
import { startupStep } from '../lib/authFlow.js';
import {
  API_BASE,
  AUTH_CONFIG,
  LOGIN_REQUEST,
  apiRequest,
  createAuthClient,
  isSessionUsable,
} from './api.js';
import { toast } from './toast.js';
import { whenAnnounced, SESSION_EXPIRED } from './events.js';

const ACCOUNT_DELETED = 410;

const t = i18n.t;

let msalClient;

// Dev mode has no session to clear, so an explicit sign-out is remembered here.
const DEV_SIGNED_OUT_KEY = 'bb-dev-signed-out';
// Set while a session exists, so a load after it lapsed (24-hour refresh token, browser restart)
// renews it silently instead of showing a stranger's signed-out page.
const SIGNED_IN_KEY = 'bb-signed-in';
// The tab's one silent (prompt=none) sign-in redirect, so a failed one never loops.
const SILENT_SIGN_IN_KEY = 'bb-silent-sign-in';

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
    const response = await fetch(`${API_BASE}/api/v1/me`);
    if (response.status === ACCOUNT_DELETED) return signOutDeletedAccount();
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

// Storage can be blocked: the flags then stay unset, which only costs the silent renewal.
function setFlag(storage, key) {
  try {
    storage.setItem(key, '1');
  } catch (error) {
    console.warn(error);
  }
}

function clearFlag(storage, key) {
  try {
    storage.removeItem(key);
  } catch (error) {
    console.warn(error);
  }
}

function readFlag(storage, key) {
  try {
    return Boolean(storage.getItem(key));
  } catch {
    return false;
  }
}

const rememberSignedIn = () => setFlag(localStorage, SIGNED_IN_KEY);
const forgetSignedIn = () => clearFlag(localStorage, SIGNED_IN_KEY);

// Read once per load: the flag only guards the redirect that this load may start.
function takeSilentSignInFlag() {
  const tried = readFlag(sessionStorage, SILENT_SIGN_IN_KEY);
  clearFlag(sessionStorage, SILENT_SIGN_IN_KEY);
  return tried;
}

async function signInSilently() {
  setFlag(sessionStorage, SILENT_SIGN_IN_KEY);
  await msalClient.loginRedirect({ ...LOGIN_REQUEST, prompt: 'none' });
}

// The page as the bridge (app.js): hands the identity provider's answer to the window that asked.
export async function relayAuthResponse() {
  await window.msalRedirectBridge.broadcastResponseToMainFrame();
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
  const silentSignInTried = takeSilentSignInFlag();
  let result;
  try {
    result = await msalClient.handleRedirectPromise();
  } catch (error) {
    // A silent sign-in that found no Entra session, or an interactive one that failed.
    console.warn(error);
    if (silentSignInTried) return endLapsedSession();
    renderNavAuth();
    toast(t('toast.signInError'), { type: 'error' });
    return;
  }
  if (result) {
    state.user = userFromAuthResult(result);
    return startSignedIn();
  }
  await restoreSession(silentSignInTried);
}

async function restoreSession(silentSignInTried) {
  const [account] = msalClient.getAllAccounts();
  const step = startupStep({
    hasAccount: Boolean(account),
    sessionUsable: Boolean(account) && (await isSessionUsable()),
    wasSignedIn: readFlag(localStorage, SIGNED_IN_KEY),
    silentSignInTried,
  });
  if (step === 'restore') {
    state.user = userFromAccount(account);
    return startSignedIn();
  }
  if (step === 'silent-sign-in') return signInSilently();
  if (step === 'session-ended') return endLapsedSession();
  renderNavAuth();
}

function startSignedIn() {
  rememberSignedIn();
  return renderSignedIn();
}

// Signing in again would need the user's hand; the next load must not try silently again.
function endLapsedSession() {
  forgetSignedIn();
  renderNavAuth();
  offerSignIn();
}

export async function signIn() {
  if (AUTH_CONFIG.useDevAuth) {
    localStorage.removeItem(DEV_SIGNED_OUT_KEY);
    await devSignIn();
    return;
  }
  // A redirect, not a popup: no popup blocker, and the answer comes back through the bridge.
  try {
    await msalClient.loginRedirect(LOGIN_REQUEST);
  } catch (error) {
    console.error(error);
    toast(t('toast.signInError'), { type: 'error' });
  }
}

// The account is being deleted: its identity is gone within a day, so the session ends now.
async function signOutDeletedAccount() {
  toast(t('errors.accountDeleted'), { type: 'error' });
  await endLocalSession();
}

/**
 * Ends the session in this browser only, so the page and its message stay; the provider's cookie
 * may outlive it (account deletion, whose directory user is gone within a day).
 */
export async function endLocalSession() {
  if (AUTH_CONFIG.useDevAuth) {
    localStorage.setItem(DEV_SIGNED_OUT_KEY, '1');
  } else {
    forgetSignedIn();
    await msalClient.clearCache();
  }
  clearSignedInState();
}

export async function signOut() {
  if (AUTH_CONFIG.useDevAuth) return endLocalSession();
  forgetSignedIn();
  try {
    // Leaves the page for Entra's sign-out, which returns to it signed out.
    await msalClient.logoutRedirect({ account: msalClient.getAllAccounts()[0] });
  } catch (error) {
    // The local session ends regardless; only the provider's cookie may outlive it.
    console.warn(error);
    await endLocalSession();
  }
}

function clearSignedInState() {
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

function offerSignIn() {
  toast(t('errors.unauthorized'), {
    type: 'error',
    action: { label: t('nav.signIn'), onClick: signIn },
  });
}

// Mid-session the sign-in waits for the toast's button: a redirect would drop unsaved work.
function askToSignInAgain() {
  if (!state.user) return;
  clearSignedInState();
  offerSignIn();
}

whenAnnounced(SESSION_EXPIRED, askToSignInAgain);

// Renders before awaiting, so the Sign In prompt never lingers behind the tours request.
async function renderSignedIn() {
  state.loadingTours = true;
  renderNavAuth();
  renderSidebar();
  await Promise.all([loadTours(), refreshUser()]);
}

// Token claims can lack the name right after sign-up; a failure keeps the token's values.
export async function refreshUser() {
  const { response, networkError } = await apiRequest('/api/v1/me');
  if (networkError) return;
  if (response.status === ACCOUNT_DELETED) return signOutDeletedAccount();
  if (!response.ok) {
    console.warn(`GET /api/v1/me answered ${response.status}`);
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
