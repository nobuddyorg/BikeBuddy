'use strict';

import { formatDate, formatDistance, initials } from './lib/format.js';
import {
  visibleTours,
  toursInView,
  paginate,
  PAGE_SIZE,
  fuzzyMatchIndices,
  withUpdatedDate,
} from './lib/tours.js';
import {
  validateGpxUpload,
  validateImageUpload,
  validateImageBatch,
  validateImageQuota,
} from './lib/files.js';
import { runWithConcurrency } from './lib/concurrency.js';
import { ensureMapData } from './lib/mapData.js';
import { isStale, markFetched } from './lib/sasCache.js';
import { parseErrorMessage, xhrUpload } from './lib/upload.js';
import { groupByProximity, fanOffsets } from './lib/pinLayout.js';
import {
  loadLineStyle,
  saveLineStyle,
  WEIGHT_MIN,
  WEIGHT_MAX,
  OPACITY_MIN,
  OPACITY_MAX,
} from './lib/lineStyle.js';
import * as i18n from './lib/i18n.js';

const t = i18n.t;
const tApi = i18n.tApi;

// Set by the classic <script>s in index.html, loaded before this module.
const BIKEBUDDY_CONFIG = window.BIKEBUDDY_CONFIG || {};
const msal = window.msal;
const L = window.L;

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  user: null,
  tours: [],
  selectedTourId: null,
  routeLayer: null,
  routePointSets: [],
  lineStyle: loadLineStyle(),
  pinLayer: null,
  showPins: false,
  loadingTours: false,
  sort: 'date-desc',
  search: '',
  filterInView: false,
  page: 1,
  selectMode: false,
  selectedIds: new Set(),
};

// ── Map setup ─────────────────────────────────────────────────────────────────

const map = L.map('map', { center: [48.5, 10.5], zoom: 6 });

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
};

const tileLayer = L.tileLayer(TILE_URLS.light, {
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

// Tile URLs are JS state, so the CSS palette's prefers-color-scheme switch
// doesn't reach them. CARTO's dark tiles are low-contrast by design, hence the
// extra map-tiles-dark filter in style.css (#342).
function applyMapTheme(isDark) {
  tileLayer.setUrl(isDark ? TILE_URLS.dark : TILE_URLS.light);
  tileLayer.getContainer()?.classList.toggle('map-tiles-dark', isDark);
}

const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
applyMapTheme(darkMediaQuery.matches);
darkMediaQuery.addEventListener('change', (e) => applyMapTheme(e.matches));

// Plain object, not the Leaflet bounds, so toursInView stays testable without
// Leaflet (#315).
function mapBoundsPlain() {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

// Leaflet caches the container size, so a panel opening or the window resizing
// leaves gray space until it is recomputed after the reflow.
function refreshMapSize() {
  requestAnimationFrame(() => map.invalidateSize());
}
window.addEventListener('resize', refreshMapSize);

// ── DOM helpers + refs ──────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const show = (el, visible) => el.classList.toggle('hidden', !visible);

function toast(message, type = 'info', ms = 4000) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  const remove = () => el.remove();
  el.addEventListener('click', remove);
  elToasts.appendChild(el);
  setTimeout(remove, ms);
}

const elTourList = $('tour-list');
const elTourCount = $('tour-count');
const elNoTours = $('no-tours');
const elTourLoading = $('tour-loading');
const elTourControls = $('tour-controls');
const elTourSearch = $('tour-search');
const elTourSort = $('tour-sort');
const elSortMenu = $('sort-menu');
const elBtnSortMenu = $('btn-sort-menu');
const elSortMenuList = $('sort-menu-list');
const elFilterInViewToggle = $('filter-in-view-toggle');
const elFilterInViewInput = $('filter-in-view-input');
const elTourPager = $('tour-pager');
const elTourPagerPrev = $('tour-pager-prev');
const elTourPagerLabel = $('tour-pager-label');
const elTourPagerNext = $('tour-pager-next');
const elBtnShowAll = $('btn-show-all');
const elBtnSelectMode = $('btn-select-mode');
const elSelectionBar = $('selection-bar');
const elSelectionCount = $('selection-count');
const elBtnDeleteSelected = $('btn-delete-selected');
const elBtnCancelSelect = $('btn-cancel-select');
const elPinToggle = $('pin-toggle');
const elPinToggleInput = $('pin-toggle-input');
const elLineStyleWrap = $('line-style-wrap');
const elBtnLineStyle = $('btn-line-style');
const elLineStyleMenu = $('line-style-menu');
const elLineStyleColor = $('line-style-color');
const elLineStyleWidth = $('line-style-width');
const elLineStyleWidthValue = $('line-style-width-value');
const elLineStyleOpacity = $('line-style-opacity');
const elLineStyleOpacityValue = $('line-style-opacity-value');
const elBtnMapExpand = $('btn-map-expand');
const elAppLayout = document.querySelector('.app-layout');
const elSidebar = document.querySelector('.sidebar');
const elAuthPrompt = $('auth-prompt');
const elMapEmpty = $('map-empty');
const elMapLoading = $('map-loading');
const elDetailPanel = $('detail-panel');
const elDetailName = $('detail-name');
const elDetailDate = $('detail-date');
const elDetailDist = $('detail-distance');
const elDetailDesc = $('detail-description');
const elBtnLogin = $('btn-login');
const elBtnLoginSidebar = $('btn-login-sidebar');
const elBtnLogout = $('btn-logout');
const elBtnUpload = $('btn-upload');
const elBtnUploadSidebar = $('btn-upload-sidebar');
const elBtnCloseDetail = $('btn-close-detail');
const elBtnDeleteTour = $('btn-delete-tour');
const elBtnEditTour = $('btn-edit-tour');
const elBtnDownloadGpx = $('btn-download-gpx');
const elImageGrid = $('tour-image-grid');
const elImageDropzone = $('image-dropzone');
const elImageFile = $('image-file');
const elImageError = $('image-error');
const elLightbox = $('lightbox');
const elLightboxImg = $('lightbox-img');
const elEditModal = $('edit-modal');
const elEditForm = $('edit-form');
const elEditName = $('edit-name');
const elEditDate = $('edit-date');
const elEditDescription = $('edit-description');
const elEditError = $('edit-error');
const elUserMenu = $('user-menu');
const elBtnProfile = $('btn-profile');
const elBtnHelp = $('btn-help');
const elHelpModal = $('help-modal');
const elToasts = $('toasts');
const elProfileModal = $('profile-modal');
const elProfileAvatar = $('profile-avatar');
const elProfileTitle = $('profile-modal-title');
const elProfileNameForm = $('profile-name-form');
const elProfileNameInput = $('profile-name-input');
const elProfileNameError = $('profile-name-error');
const elProfileEmail = $('profile-email');
const elBtnExportData = $('btn-export-data');
const elBtnDeleteAccount = $('btn-delete-account');
const elProfileSince = $('profile-since');
const elUploadModal = $('upload-modal');
const elUploadForm = $('upload-form');
const elUploadName = $('upload-name');
const elUploadDescription = $('upload-description');
const elDropzone = $('dropzone');
const elUploadFile = $('upload-file');
const elDropzoneFilename = $('dropzone-filename');
const elUploadProgress = $('upload-progress');
const elUploadProgressBar = $('upload-progress-bar');
const elUploadError = $('upload-error');
const elBtnSubmitUpload = $('btn-submit-upload');

// ── Auth (Microsoft Entra External ID via MSAL Browser) ──────────────────────

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

// ── Dev mode (BIKEBUDDY_CONFIG.devMode = true) ────────────────────────────────

// Fallback for when the backend isn't reachable at all (frontend opened from
// file://); with it running, dev sign-in goes through the real /api/me.
const SYNTHETIC_USER = {
  id: 'local-dev-user',
  name: 'Local Dev',
  email: 'dev@localhost',
  createdAt: new Date().toISOString(),
};

// One-way on purpose: a user with no saved language keeps the active locale
// until they pick one in settings, rather than having it written back (#290).
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

// ─────────────────────────────────────────────────────────────────────────────

async function initAuth() {
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
    // localStorage, not sessionStorage: survives tab close/reopen (#146).
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

async function signIn() {
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

async function signOut() {
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
  [elEditModal, elUploadModal, elProfileModal, elHelpModal].forEach((m) => show(m, false));
  renderSidebar();
  renderNavAuth();
}

async function getAccessToken() {
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
async function refreshUser() {
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

function renderNavAuth() {
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

// ── API ───────────────────────────────────────────────────────────────────────

const API_BASE = BIKEBUDDY_CONFIG.apiBaseUrl || '';

async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(API_BASE + path, { ...options, headers });
}

// ── Tours ───────────────────────────────────────────────────────────────────

async function loadTours() {
  // Fired alongside /api/tours rather than after it (#397): on a cold backend
  // both pay the same cold-start latency, so starting them together instead of
  // in sequence roughly halves the wait before the map can render.
  const mapDataPromise = apiFetch('/api/map');
  mapDataPromise.catch(() => {}); // avoid an unhandled-rejection warning if renderAllRoutes never consumes it
  try {
    const res = await apiFetch('/api/tours');
    if (!res.ok) throw new Error('load failed');
    state.tours = await res.json();
  } catch {
    state.tours = [];
    toast(t('toast.toursLoadError'), 'error');
  } finally {
    state.loadingTours = false;
  }
  renderSidebar();
  await renderAllRoutes(mapDataPromise);
}

// Keyed on the explicit flag rather than on heatmapData/images being present:
// ensureMapData fills those in too, from the leaner /api/map payload. Expires
// ahead of the signed URLs it holds, so a long-open tab refetches (#362).
async function ensureDetail(tour) {
  if (tour.detailLoaded && !isStale(tour)) return;
  try {
    const res = await apiFetch(`/api/tours/${tour.id}`);
    if (res.ok) {
      const detail = await res.json();
      tour.heatmapData = detail.heatmapData || [];
      tour.images = detail.images || [];
      tour.gpxFileUrl = detail.gpxFileUrl;
    }
  } catch {
    // offline — the fallbacks below keep callers working
  }
  tour.heatmapData = tour.heatmapData || [];
  tour.images = tour.images || [];
  tour.detailLoaded = true;
  markFetched(tour);
}

// ── Sidebar rendering ─────────────────────────────────────────────────────────

// textContent, never innerHTML: tour names are user-supplied.
function textDiv(className, text) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

// Long-press is mobile's only way into select mode once the Select button is
// hidden there (#275). Wired unconditionally — Pointer Events cover mouse
// click-and-hold too, alongside the button.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const SWIPE_ACTION_THRESHOLD_PX = 72;

// Revealing the selection bar shifts every row down, so a long-press's ghost
// click can land anywhere in the sidebar — even on Cancel/Delete — not just on
// #tour-list. elSidebar is the nearest ancestor that survives the re-render and
// contains both. The timeout covers the browsers that suppress the ghost click
// entirely, where nothing would otherwise clear the flag.
let suppressNextTourClick = false;

function suppressNextTourClickOnce() {
  suppressNextTourClick = true;
  setTimeout(() => {
    suppressNextTourClick = false;
  }, 400);
}

elSidebar.addEventListener(
  'click',
  (e) => {
    if (suppressNextTourClick) {
      e.stopImmediatePropagation();
      suppressNextTourClick = false;
    }
  },
  true,
);

// onLongPress fires from pointerup, not from the 500ms timer: firing it while
// the pointer is still down lets its re-render destroy the <li> mid-gesture,
// and the browser then retargets the pending pointerup/click to whatever has
// taken its place.
function bindLongPress(el, onLongPress) {
  let timer = null;
  let start = null;
  let ready = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    start = null;
    ready = false;
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ready = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      ready = true;
    }, LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) cancel();
  });

  el.addEventListener('pointerup', () => {
    clearTimeout(timer);
    timer = null;
    start = null;
    if (ready) {
      ready = false;
      if (onLongPress()) suppressNextTourClickOnce();
    }
  });
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
}

// Touch-only, like bindLongPress (#275). Dragging contentEl uncovers whichever
// of its two sibling backgrounds the direction points at; past
// SWIPE_ACTION_THRESHOLD_PX on release, right deletes (#289) and left opens the
// detail panel (#308). Anything less snaps back — release only ever looks at
// the final dx, so a drag-back needs no cancelled state of its own.
function bindTourSwipe(contentEl, tour) {
  let start = null;
  let dragging = false;

  const reset = () => {
    contentEl.style.transition = 'transform 0.2s';
    contentEl.style.transform = 'translateX(0)';
    start = null;
    dragging = false;
  };

  contentEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || state.selectMode) return;
    start = { x: e.clientX, y: e.clientY };
    dragging = false;
  });

  contentEl.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging && Math.abs(dy) > Math.abs(dx)) {
      start = null; // vertical scroll intent — let the browser handle it
      return;
    }
    dragging = true;
    contentEl.style.transition = 'none';
    // Half the row's width: each background occupies one half, and an overshoot
    // past that starts revealing the other action's on the far edge.
    const maxDx = contentEl.offsetWidth / 2;
    const clampedDx = Math.max(-maxDx, Math.min(maxDx, dx));
    contentEl.style.transform = `translateX(${clampedDx}px)`;
  });

  contentEl.addEventListener('pointerup', async (e) => {
    if (!dragging) {
      start = null;
      return;
    }
    const dx = e.clientX - start.x;
    reset();
    if (dx >= SWIPE_ACTION_THRESHOLD_PX) {
      // Once the list re-renders without this tour, a trailing ghost click
      // would land on whatever row took its place.
      suppressNextTourClickOnce();
      await deleteTourById(tour.id);
    } else if (dx <= -SWIPE_ACTION_THRESHOLD_PX) {
      // No suppression needed here: nothing shifts, so the ghost click lands
      // back on this row, where highlightTour's same-tour guard eats it (#310).
      selectTour(tour.id);
    }
  });

  contentEl.addEventListener('pointercancel', reset);
  contentEl.addEventListener('pointerleave', () => {
    if (dragging) reset();
  });
}

// Wraps runs of matched indices in <mark>, via createElement/textContent only —
// tour names are user-supplied.
function highlightedNameNode(name, indices) {
  name = name || '';
  const div = document.createElement('div');
  div.className = 'tour-item-name';
  const matched = new Set(indices);
  let i = 0;
  while (i < name.length) {
    let j = i;
    while (j < name.length && matched.has(j) === matched.has(i)) j++;
    const run = name.slice(i, j);
    if (matched.has(i)) {
      const mark = document.createElement('mark');
      mark.textContent = run;
      div.appendChild(mark);
    } else {
      div.appendChild(document.createTextNode(run));
    }
    i = j;
  }
  return div;
}

// Glyphs rather than emoji: these sit on coloured backgrounds and had to read
// the same regardless of platform emoji rendering.
const TRASH_ICON_SVG =
  '<svg class="tour-item-delete-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="#000" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>' +
  '</svg>';

const DETAIL_ICON_SVG =
  '<svg class="tour-item-detail-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="#000" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>' +
  '</svg>';

function createTourItem(tour) {
  const li = document.createElement('li');
  li.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');

  const deleteBg = document.createElement('div');
  deleteBg.className = 'tour-item-delete-bg';
  deleteBg.setAttribute('aria-hidden', 'true');
  deleteBg.innerHTML = TRASH_ICON_SVG;

  const detailBg = document.createElement('div');
  detailBg.className = 'tour-item-detail-bg';
  detailBg.setAttribute('aria-hidden', 'true');
  detailBg.innerHTML = DETAIL_ICON_SVG;

  const content = document.createElement('div');
  content.className = 'tour-item-content';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tour-item-checkbox';
  checkbox.checked = state.selectedIds.has(tour.id);
  checkbox.setAttribute('aria-hidden', 'true');
  show(checkbox, state.selectMode);

  const details = document.createElement('div');
  details.className = 'tour-item-details';
  details.append(
    highlightedNameNode(tour.name, fuzzyMatchIndices(state.search, tour.name)),
    textDiv(
      'tour-item-meta',
      `${formatDate(tour.createdAt, i18n.dateLocale())} · ${formatDistance(tour.distance)}`,
    ),
  );

  content.append(checkbox, details);
  // A click event isn't reliably a PointerEvent across browsers, so the input
  // type has to come from the preceding pointerdown.
  let lastPointerType = null;
  content.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType;
  });
  content.addEventListener('click', () => {
    if (state.selectMode) {
      toggleTourSelection(tour.id);
    } else if (lastPointerType === 'touch') {
      // On touch the panel is swipe-left's job (#308) and select mode is
      // long-press's (#310), so a tap only highlights.
      highlightTour(tour.id);
    } else {
      selectTour(tour.id);
    }
  });
  bindLongPress(content, () => {
    if (state.selectMode) return false;
    enterSingleSelect(tour.id);
    return true;
  });
  bindTourSwipe(content, tour);

  li.append(deleteBg, detailBg, content);
  return li;
}

function renderSidebar() {
  const signedIn = !!state.user;
  const loading = signedIn && state.loadingTours;
  const hasTours = signedIn && !loading && state.tours.length > 0;

  show(elTourLoading, loading);
  show(elAuthPrompt, !signedIn);
  show(elNoTours, signedIn && !loading && state.tours.length === 0);
  show(elTourControls, hasTours);
  show(elFilterInViewToggle, hasTours);
  show(elLineStyleWrap, hasTours);
  show(elTourList, hasTours);
  show(elBtnShowAll, hasTours);
  show(elBtnSelectMode, hasTours);
  show(elSelectionBar, hasTours && state.selectMode);
  elTourCount.textContent = signedIn && !loading ? state.tours.length : '0';
  elSelectionCount.textContent = t('sidebar.selectedCount', { count: state.selectedIds.size });
  elBtnDeleteSelected.disabled = state.selectedIds.size === 0;

  elTourList.innerHTML = '';
  if (!hasTours) {
    show(elTourPager, false);
    return;
  }

  const scoped = state.filterInView ? toursInView(state.tours, mapBoundsPlain()) : state.tours;
  const visible = visibleTours(scoped, state.sort, state.search);
  if (visible.length === 0) {
    elTourList.appendChild(textDiv('tour-empty', t('tours.noMatch')));
    show(elTourPager, false);
    return;
  }

  const { items, page, totalPages } = paginate(visible, state.page, PAGE_SIZE);
  state.page = page;
  items.forEach((tour) => elTourList.appendChild(createTourItem(tour)));

  show(elTourPager, totalPages > 1);
  elTourPagerLabel.textContent = t('sidebar.pagerLabel', { page, totalPages });
  elTourPagerPrev.disabled = page <= 1;
  elTourPagerNext.disabled = page >= totalPages;
}

function toggleTourSelection(tourId) {
  if (state.selectedIds.has(tourId)) {
    state.selectedIds.delete(tourId);
  } else {
    state.selectedIds.add(tourId);
  }
  renderSidebar();
  renderSelectedToursRoutes();
}

function enterSelectMode() {
  state.selectMode = true;
  renderSidebar();
}

// Long-press only (#310) — a plain tap highlights instead.
function enterSingleSelect(tourId) {
  enterSelectMode();
  toggleTourSelection(tourId);
}

// A tap's half of what a desktop click does: select and focus the map, but
// leave the panel to swipe-left (#308/#310). Any panel already open belongs to
// another tour, and its actions all read selectedTourId, so it has to close.
//
// The same-tour early return is load-bearing, not just an optimisation: it is
// what stops a swipe-left's own trailing ghost click from closing the panel
// that swipe just opened.
function highlightTour(tourId) {
  if (state.selectedTourId === tourId) return;
  closeDetailPanel();
  state.selectedTourId = tourId;
  renderSidebar();
  focusTourOnMap(tourId); // #331: a plain tap must focus the map like a click does
}

function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  renderSidebar();
  renderAllRoutes();
}

// ── Route rendering (#418, #420) ─────────────────────────────────────────────

function clearRouteLayer() {
  if (state.routeLayer) {
    map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
}

// One polyline per tour, so tours never get joined by a spurious segment
// across the gap between them the way a single flattened point list would.
function drawRoutes(pointSets) {
  clearRouteLayer();
  const lines = pointSets
    .filter((pts) => pts.length > 1)
    .map((pts) => L.polyline(pts, state.lineStyle));
  if (lines.length === 0) return;
  state.routeLayer = L.layerGroup(lines).addTo(map);
}

// Redraws the last-rendered tours in the current style without touching
// pan/zoom, so changing color/width/opacity doesn't re-fit the map.
function redrawRoutes() {
  drawRoutes(state.routePointSets);
}

function renderRoutes(pointSets, padding) {
  state.routePointSets = pointSets;
  drawRoutes(pointSets);
  const allPoints = pointSets.flat();
  if (allPoints.length === 0) return;
  map.fitBounds(L.latLngBounds(allPoints), { padding: [padding, padding] });
}

async function renderAllRoutes(mapDataPromise) {
  show(elMapLoading, true);
  await ensureMapData(apiFetch, state.tours, mapDataPromise);
  show(elMapLoading, false);
  const pointSets = state.tours.map((t) => t.heatmapData || []);
  renderRoutes(pointSets, 40);
  show(
    elMapEmpty,
    pointSets.every((pts) => pts.length === 0),
  );
  renderPins();
}

// Mirrors the checked set while in select mode (#298), falling back to all
// tours when nothing is checked so the map never goes blank.
async function renderSelectedToursRoutes() {
  if (state.selectedIds.size === 0) {
    await renderAllRoutes();
    if (state.selectedIds.size !== 0) return renderSelectedToursRoutes();
    return;
  }
  const requested = [...state.selectedIds].sort().join(',');
  const tours = state.tours.filter((tour) => state.selectedIds.has(tour.id));
  await ensureMapData(apiFetch, state.tours);
  if ([...state.selectedIds].sort().join(',') !== requested) return; // selection changed while loading
  const pointSets = tours.map((t) => t.heatmapData || []);
  renderRoutes(pointSets, 40);
  show(
    elMapEmpty,
    pointSets.every((pts) => pts.length === 0),
  );
  renderPins();
}

// ── Photo pins (#100, #210) ─────────────────────────────────────────────────

const PIN_GROUP_THRESHOLD_PX = 24;
const PIN_FAN_RADIUS_PX = 16;
const PIN_MIN_ZOOM = 8;

// Scoped to the selected tour so its pins never leak in photos from others
// (#274), and across every loaded tour on the full map.
function geotaggedImages() {
  const tours = state.selectedTourId
    ? state.tours.filter((t) => t.id === state.selectedTourId)
    : state.tours;
  return tours.flatMap((t) =>
    (t.images || []).filter((img) => typeof img.lat === 'number' && typeof img.lon === 'number'),
  );
}

// L.divIcon's element form, not its string form: img.src is a property write
// rather than parsed markup. The URLs are safe today, but only because of how
// the backend names blobs — three modules away from here (#367).
function photoPinIcon(url) {
  const img = document.createElement('img');
  img.src = url;
  img.alt = t('lightbox.imgAlt');
  return L.divIcon({
    className: 'photo-pin',
    html: img,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// Kept across renderPins() calls so a re-render repositions markers instead of
// recreating their DOM, which flickered the pin images on every zoom step.
const pinMarkers = new Map();

function clearPins() {
  if (state.pinLayer) {
    map.removeLayer(state.pinLayer);
    state.pinLayer = null;
  }
  pinMarkers.clear();
}

function makePinMarker(img, latlng) {
  const marker = L.marker(latlng, { icon: photoPinIcon(img.url) });
  marker.on('click', () => openLightbox(img.url));
  return marker;
}

// Grouping and fanning work in screen pixels at the current zoom (#210), so
// overlapping pins separate and re-collapse live as the user zooms. Below
// PIN_MIN_ZOOM photos from unrelated tours fall into the same group and clutter
// the fan, so pins are hidden entirely down there (#236).
function renderPins() {
  const images = geotaggedImages();
  show(elPinToggle, images.length > 0);
  if (!state.showPins || images.length === 0 || map.getZoom() < PIN_MIN_ZOOM) {
    clearPins();
    return;
  }

  const zoom = map.getZoom();
  const points = images.map((img) => {
    const { x, y } = map.project([img.lat, img.lon], zoom);
    return { x, y, img };
  });

  const seen = new Set();
  const added = [];
  groupByProximity(points, PIN_GROUP_THRESHOLD_PX).forEach((group) => {
    const offsets = fanOffsets(group.length, PIN_FAN_RADIUS_PX);
    group.forEach((point, i) => {
      const [dx, dy] = offsets[i];
      const latlng = map.unproject([point.x + dx, point.y + dy], zoom);
      seen.add(point.img.id);
      const existing = pinMarkers.get(point.img.id);
      if (existing) {
        existing.setLatLng(latlng);
      } else {
        const marker = makePinMarker(point.img, latlng);
        pinMarkers.set(point.img.id, marker);
        added.push(marker);
      }
    });
  });

  // Drop markers for photos no longer present (deleted, or tour data reloaded).
  for (const [id, marker] of pinMarkers) {
    if (seen.has(id)) continue;
    state.pinLayer?.removeLayer(marker);
    pinMarkers.delete(id);
  }

  if (!state.pinLayer) state.pinLayer = L.layerGroup().addTo(map);
  added.forEach((marker) => state.pinLayer.addLayer(marker));
}

// 'moveend' covers pan and zoom both, so the in-view list needs no second
// listener (#315).
map.on('moveend', () => {
  if (state.filterInView) renderSidebar();
});
map.on('zoomend', renderPins);

// ── Tour selection ────────────────────────────────────────────────────────────

// The map half of selecting a tour, shared by selectTour and highlightTour so
// a plain tap isn't left on a stale full-map view (#331). Returns null if the
// selection moved on while detail was loading.
async function focusTourOnMap(tourId) {
  const tour = state.tours.find((t) => t.id === tourId);
  if (!tour) return null;
  await ensureDetail(tour);
  if (state.selectedTourId !== tourId) return null; // user switched while loading
  show(elMapEmpty, false);
  renderRoutes([tour.heatmapData || []], 60);
  renderPins();
  return tour;
}

async function selectTour(tourId) {
  const tour = state.tours.find((t) => t.id === tourId);
  if (!tour) return;

  state.selectedTourId = tourId;
  renderSidebar();
  renderDetailPanel(tour); // name/meta now; resets the image section
  const loaded = await focusTourOnMap(tourId);
  if (loaded) renderGallery(loaded);
}

// The panel closes, the selection outlives it: the map is always showing one
// tour with its own photos or every tour with all of them, never a mix (#378).
function closeDetailPanel() {
  show(elDetailPanel, false);
  refreshMapSize();
}

// Ends the selection itself. Every caller renders the all-tours map after,
// which is what keeps the map off a tour that is no longer selected.
function deselectTour() {
  state.selectedTourId = null;
  closeDetailPanel();
  renderSidebar();
  renderPins();
}

function openEdit() {
  const tour = state.tours.find((t) => t.id === state.selectedTourId);
  if (!tour) return;
  elEditName.value = tour.name || '';
  elEditDate.value = tour.createdAt ? tour.createdAt.slice(0, 10) : '';
  elEditDescription.value = tour.description || '';
  show(elEditError, false);
  openModal(elEditModal);
}

function closeEdit() {
  closeModal(elEditModal);
}

async function submitEdit(e) {
  e.preventDefault();
  const id = state.selectedTourId;
  const tour = state.tours.find((t) => t.id === id);
  if (!tour) return;

  show(elEditError, false);
  try {
    const res = await apiFetch(`/api/tours/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: elEditName.value.trim(),
        description: elEditDescription.value.trim(),
        createdAt: withUpdatedDate(tour.createdAt, elEditDate.value),
      }),
    });
    if (!res.ok) {
      elEditError.textContent = tApi(parseErrorMessage(await res.text(), t('errors.saveChanges')));
      show(elEditError, true);
      return;
    }
    const updated = await res.json();
    Object.assign(tour, {
      name: updated.name,
      description: updated.description,
      createdAt: updated.createdAt,
    });
    closeEdit();
    renderSidebar();
    renderDetailPanel(tour);
  } catch {
    elEditError.textContent = t('errors.network');
    show(elEditError, true);
  }
}

async function deleteTourById(id) {
  if (!confirm(t('confirm.deleteTour'))) return;
  try {
    const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    state.tours = state.tours.filter((t) => t.id !== id);
    if (id === state.selectedTourId) deselectTour();
    renderSidebar();
    await renderAllRoutes();
    toast(t('toast.tourDeleted'), 'success');
  } catch {
    toast(t('toast.tourDeleteError'), 'error');
  }
}

async function deleteSelectedTour() {
  if (!state.selectedTourId) return;
  await deleteTourById(state.selectedTourId);
}

async function deleteSelectedTours() {
  if (state.selectedIds.size === 0) return;
  if (!confirm(t('confirm.deleteTours'))) return;

  const ids = [...state.selectedIds];
  const succeeded = [];
  const failed = [];

  await runWithConcurrency(ids, 3, async (id) => {
    try {
      const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      succeeded.push(id);
    } catch {
      failed.push(id);
    }
  });

  state.tours = state.tours.filter((tour) => !succeeded.includes(tour.id));
  succeeded.forEach((id) => state.selectedIds.delete(id));
  if (succeeded.includes(state.selectedTourId)) {
    deselectTour();
  }

  if (failed.length === 0) {
    state.selectMode = false;
    toast(
      succeeded.length === 1
        ? t('toast.tourDeleted')
        : t('toast.toursDeleted', { count: succeeded.length }),
      'success',
    );
  } else if (succeeded.length === 0) {
    toast(t('toast.tourDeleteError'), 'error');
  } else {
    toast(
      t('toast.toursDeletedPartial', {
        deleted: succeeded.length,
        total: ids.length,
      }),
      'error',
    );
  }

  renderSidebar();
  await renderAllRoutes();
}

function renderDetailPanel(tour) {
  elDetailName.textContent = tour.name;
  elDetailDate.textContent = formatDate(tour.createdAt, i18n.dateLocale());
  elDetailDist.textContent = formatDistance(tour.distance);
  elDetailDesc.textContent = tour.description || '';
  resetImageSection();
  show(elDetailPanel, true);
  refreshMapSize();
}

// ── Tour images (upload) ──────────────────────────────────────────────────────

function resetImageSection() {
  elImageGrid.innerHTML = '';
  show(elImageError, false);
  elImageDropzone.classList.remove('dragover');
}

function createImageTile(image) {
  const fig = document.createElement('figure');
  fig.className = 'image-tile';

  const img = document.createElement('img');
  img.className = 'image-thumb';
  img.src = image.url;
  img.alt = t('lightbox.imgAlt');
  img.loading = 'lazy';
  img.addEventListener('click', () => openLightbox(image.url));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'image-delete';
  del.setAttribute('aria-label', t('detail.deletePhotoAria'));
  del.textContent = '✕';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteImage(image.id, fig);
  });

  fig.append(img, del);
  return fig;
}

// One in-flight upload: pending (progress ring) → error (retry/dismiss) or done
// (swapped for the markup createImageTile produces).
function createPendingImageTile(file) {
  const fig = document.createElement('figure');
  fig.className = 'image-tile image-tile-pending';
  fig.dataset.testid = 'image-tile-pending';

  const ring = document.createElement('div');
  ring.className = 'image-progress-ring';
  ring.style.setProperty('--progress', '0');

  const name = document.createElement('p');
  name.className = 'image-tile-filename';
  name.textContent = file.name;

  fig.append(ring, name);

  const tile = {
    el: fig,
    onRetry: null,
    setProgress(percent) {
      ring.style.setProperty('--progress', String(percent));
    },
    reset() {
      fig.className = 'image-tile image-tile-pending';
      fig.dataset.testid = 'image-tile-pending';
      fig.innerHTML = '';
      ring.style.setProperty('--progress', '0');
      fig.append(ring, name);
    },
    setError(message, retryable) {
      fig.className = 'image-tile image-tile-error';
      fig.dataset.testid = 'image-tile-error';
      fig.innerHTML = '';

      const msg = document.createElement('p');
      msg.className = 'image-tile-error-message';
      msg.textContent = message;

      const actions = document.createElement('div');
      actions.className = 'image-tile-actions';

      if (retryable) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'image-tile-retry';
        retry.dataset.testid = 'image-tile-retry';
        retry.setAttribute('aria-label', t('detail.retryPhotoAria'));
        retry.textContent = '↻';
        retry.addEventListener('click', () => tile.onRetry && tile.onRetry());
        actions.append(retry);
      }

      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'image-tile-dismiss';
      dismiss.dataset.testid = 'image-tile-dismiss';
      dismiss.setAttribute('aria-label', t('detail.dismissPhotoAria'));
      dismiss.textContent = '✕';
      dismiss.addEventListener('click', () => fig.remove());
      actions.append(dismiss);

      fig.append(msg, actions);
    },
    setDone(image) {
      fig.replaceWith(createImageTile(image));
    },
  };
  return tile;
}

function renderGallery(tour) {
  elImageGrid.innerHTML = '';
  (tour.images || []).forEach((image) => elImageGrid.appendChild(createImageTile(image)));
}

function openLightbox(url) {
  elLightboxImg.src = url;
  show(elLightbox, true);
}

function closeLightbox() {
  show(elLightbox, false);
  elLightboxImg.src = '';
}

async function deleteImage(imageId, tileEl) {
  if (!confirm(t('confirm.deletePhoto'))) return;
  const tourId = state.selectedTourId;
  try {
    const res = await apiFetch(`/api/tours/${tourId}/images/${imageId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    tileEl.remove();
    const tour = state.tours.find((t) => t.id === tourId);
    if (tour?.images) tour.images = tour.images.filter((i) => i.id !== imageId);
  } catch {
    showImageError(t('toast.photoDeleteError'));
  }
}

function showImageError(message) {
  elImageError.textContent = message;
  show(elImageError, true);
}

// One request per file against the single-image endpoint, 3 in flight at once —
// see docs/superpowers/specs/2026-07-03-multi-image-upload-design.md.
async function uploadImages(files) {
  show(elImageError, false);
  const tourId = state.selectedTourId;
  if (!tourId || files.length === 0) return;

  const batchError = validateImageBatch(files);
  if (batchError) {
    showImageError(t(batchError));
    return;
  }

  const token = await getAccessToken();
  const tour = state.tours.find((t) => t.id === tourId);
  let imageCount = tour?.images?.length || 0;
  const jobs = [];
  for (const file of files) {
    const tile = createPendingImageTile(file);
    elImageGrid.appendChild(tile.el);

    const quotaError = validateImageQuota(imageCount);
    if (quotaError) {
      tile.setError(t(quotaError), false);
      continue;
    }

    const fileError = validateImageUpload(file);
    if (fileError) {
      tile.setError(t(fileError), false);
      continue;
    }
    imageCount++;
    jobs.push({ file, tile });
  }

  const uploadOne = async (job) => {
    job.tile.reset();
    try {
      const image = await xhrUpload(
        `${API_BASE}/api/tours/${tourId}/images`,
        job.file,
        token,
        job.tile.setProgress,
      );
      if (tour) tour.images = [...(tour.images || []), image];
      job.tile.setDone(image);
      renderPins(); // a newly uploaded geotagged photo may add a marker
    } catch (err) {
      job.tile.setError(err.message, true);
    }
  };
  jobs.forEach((job) => {
    job.tile.onRetry = () => uploadOne(job);
  });

  await runWithConcurrency(jobs, 3, uploadOne);
}

// ── Profile modal ─────────────────────────────────────────────────────────────

function renderProfile() {
  elProfileTitle.textContent = state.user.name || t('profile.yourAccount');
  elProfileAvatar.textContent = initials(state.user.name || state.user.email);
  elProfileEmail.textContent = state.user.email || '—';
  elProfileSince.textContent = state.user.createdAt
    ? formatDate(state.user.createdAt, i18n.dateLocale())
    : '—';
  elProfileNameInput.value = state.user.name || '';
}

async function openProfile() {
  if (!state.user) return;
  renderProfile();
  openModal(elProfileModal);

  // Join date lives on the user doc, which the login session may not have.
  if (!state.user.createdAt) {
    await refreshUser();
    renderProfile();
  }
}

function closeProfile() {
  closeModal(elProfileModal);
}

async function saveProfileName(e) {
  e.preventDefault();
  const name = elProfileNameInput.value.trim();
  show(elProfileNameError, false);
  try {
    const res = await apiFetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      elProfileNameError.textContent = parseErrorMessage(await res.text(), t('errors.saveName'));
      show(elProfileNameError, true);
      return;
    }
    state.user = { ...state.user, ...(await res.json()) };
    renderProfile();
    renderNavAuth();
    toast(t('toast.nameUpdated'), 'success');
  } catch {
    elProfileNameError.textContent = t('errors.network');
    show(elProfileNameError, true);
  }
}

// Persisted before it is applied: i18n.setLanguage reloads the page, so
// anything after it never runs.
async function selectLanguage(code) {
  try {
    const res = await apiFetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: code }),
    });
    if (!res.ok) {
      toast(parseErrorMessage(await res.text(), t('errors.saveLanguage')), 'error');
      return;
    }
    i18n.setLanguage(code);
  } catch {
    toast(t('errors.network'), 'error');
  }
}

// GDPR data export.
async function downloadMyData() {
  try {
    const res = await apiFetch('/api/me/export');
    if (!res.ok) throw new Error('export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bikebuddy-export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast(t('toast.exportDone'), 'success');
  } catch {
    toast(t('toast.exportError'), 'error');
  }
}

// A navigation, not a fetch: the blob is cross-origin and its filename comes
// from the signed URL's Content-Disposition. Navigations report nothing back,
// so an expired URL would download storage's XML error as <tour>.gpx — hence
// the refresh first, and the refusal to navigate without a usable URL (#362).
async function downloadSelectedGpx() {
  const tour = state.tours.find((t) => t.id === state.selectedTourId);
  if (!tour) return;
  await ensureDetail(tour);
  if (!tour.gpxFileUrl) {
    toast(t('toast.gpxDownloadError'), 'error');
    return;
  }
  const a = document.createElement('a');
  a.href = tour.gpxFileUrl;
  a.click();
}

// GDPR erasure.
async function deleteMyAccount() {
  if (!confirm(t('confirm.deleteAccount'))) return;
  try {
    const res = await apiFetch('/api/account', { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    closeProfile();
    toast(t('toast.accountDeleted'), 'success');
    await signOut();
  } catch {
    toast(t('toast.accountDeleteError'), 'error');
  }
}

// ── Upload modal ──────────────────────────────────────────────────────────────

let selectedFile = null;

function resetUploadForm() {
  selectedFile = null;
  elUploadForm.reset();
  show(elDropzoneFilename, false);
  show(elUploadProgress, false);
  show(elUploadError, false);
  elUploadProgressBar.style.width = '0%';
  elDropzone.classList.remove('dragover');
  elBtnSubmitUpload.disabled = true;
}

function openUpload() {
  if (!state.user) return;
  resetUploadForm();
  openModal(elUploadModal);
}

function closeUpload() {
  closeModal(elUploadModal);
}

function showUploadError(message) {
  elUploadError.textContent = message;
  show(elUploadError, true);
}

function selectFile(file) {
  show(elUploadError, false);
  if (!file) return;
  const uploadError = validateGpxUpload(file);
  if (uploadError) {
    showUploadError(t(uploadError));
    return;
  }
  selectedFile = file;
  elDropzoneFilename.textContent = file.name;
  show(elDropzoneFilename, true);
  elBtnSubmitUpload.disabled = false;
  if (!elUploadName.value) elUploadName.value = file.name.replace(/\.gpx$/i, '');
}

async function submitUpload(e) {
  e.preventDefault();
  if (!selectedFile) return;

  const params = new URLSearchParams();
  if (elUploadName.value.trim()) params.set('name', elUploadName.value.trim());
  if (elUploadDescription.value.trim()) params.set('description', elUploadDescription.value.trim());

  const token = await getAccessToken();
  elBtnSubmitUpload.disabled = true;
  show(elUploadError, false);
  show(elUploadProgress, true);
  elUploadProgressBar.style.width = '0%';
  try {
    const { tourId } = await xhrUpload(
      `${API_BASE}/api/tours/upload?${params.toString()}`,
      selectedFile,
      token,
      (p) => {
        elUploadProgressBar.style.width = `${p}%`;
      },
    );
    closeUpload();
    await loadTours();
    selectTour(tourId); // success → jump to the new tour's route
    toast(t('toast.tourUploaded'), 'success');
  } catch (err) {
    showUploadError(tApi(err.message));
    show(elUploadProgress, false);
    elBtnSubmitUpload.disabled = false;
  }
}

// ── DOM wiring helpers ──────────────────────────────────────────────────────────

// onFiles always receives an array; single-file callers destructure the first.
function wireDropzone(zone, input, onFiles) {
  input.addEventListener('change', () => {
    onFiles(Array.from(input.files));
    input.value = ''; // allow re-selecting the same file(s)
  });
  // The input is nested inside the zone, so its bubbled click would re-enter
  // this handler and the browser would block the dialog as programmatic.
  zone.addEventListener('click', (e) => {
    if (e.target !== input) input.click();
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    onFiles(Array.from(e.dataTransfer.files));
  });
}

// ── Modal accessibility (#115) ──────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';
let modalReturnFocus = null;

function openModal(modal) {
  modalReturnFocus = document.activeElement;
  show(modal, true);
  const focusables = modal.querySelectorAll(FOCUSABLE);
  (focusables[focusables.length > 1 ? 1 : 0] || modal).focus();
}

function closeModal(modal) {
  show(modal, false);
  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  modalReturnFocus = null;
}

const openModalEl = () => document.querySelector('.modal-overlay:not(.hidden)');

function trapFocus(e, modal) {
  if (e.key !== 'Tab') return;
  const f = [...modal.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (f.length === 0) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function wireModalClose(modal, closeBtn, closeFn) {
  closeBtn.addEventListener('click', closeFn);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeFn();
  });
}

// ── Event listeners ───────────────────────────────────────────────────────────

elBtnLogin.addEventListener('click', signIn);
elBtnLoginSidebar.addEventListener('click', signIn);
elBtnLogout.addEventListener('click', signOut);
elBtnProfile.addEventListener('click', openProfile);
elProfileNameForm.addEventListener('submit', saveProfileName);
elBtnExportData.addEventListener('click', downloadMyData);
elBtnDeleteAccount.addEventListener('click', deleteMyAccount);
elBtnCloseDetail.addEventListener('click', closeDetailPanel);
elBtnDeleteTour.addEventListener('click', deleteSelectedTour);
elBtnEditTour.addEventListener('click', openEdit);
elBtnDownloadGpx.addEventListener('click', downloadSelectedGpx);
elBtnUpload.addEventListener('click', openUpload);
elBtnUploadSidebar.addEventListener('click', openUpload);
elEditForm.addEventListener('submit', submitEdit);
elUploadForm.addEventListener('submit', submitUpload);

elTourSearch.addEventListener('input', () => {
  state.search = elTourSearch.value;
  state.page = 1;
  renderSidebar();
});
elTourSort.addEventListener('change', () => {
  state.sort = elTourSort.value;
  state.page = 1;
  renderSidebar();
});
elFilterInViewInput.addEventListener('change', () => {
  state.filterInView = elFilterInViewInput.checked;
  state.page = 1;
  renderSidebar();
});
// Same reload quirk as elPinToggleInput below.
elFilterInViewInput.checked = state.filterInView;
elTourPagerPrev.addEventListener('click', () => {
  state.page -= 1;
  renderSidebar();
});
elTourPagerNext.addEventListener('click', () => {
  state.page += 1;
  renderSidebar();
});
elBtnShowAll.addEventListener('click', () => {
  deselectTour();
  renderAllRoutes();
});
elBtnSelectMode.addEventListener('click', enterSelectMode);
elBtnCancelSelect.addEventListener('click', exitSelectMode);
elBtnDeleteSelected.addEventListener('click', deleteSelectedTours);
elPinToggleInput.addEventListener('change', () => {
  state.showPins = elPinToggleInput.checked;
  renderPins();
});

// The browser restores the checkbox on reload while JS state resets to false,
// so without this the pins need an off/on toggle to reappear (#145).
elPinToggleInput.checked = state.showPins;

// Expand the map by collapsing the side panels (#143).
elBtnMapExpand.addEventListener('click', () => {
  const expanded = elAppLayout.classList.toggle('map-expanded');
  elBtnMapExpand.setAttribute('aria-pressed', String(expanded));
  elBtnMapExpand.title = expanded ? t('map.restoreTitle') : t('map.expandTitle');
  refreshMapSize();
});

function setupLanguageSwitcher() {
  const elBtnLang = $('btn-lang');
  const elLangMenu = $('lang-menu');
  const elLangSearch = $('lang-search');
  const elLangList = $('lang-list');
  const meta = i18n.getLocaleMeta();
  // Full name, not the short code: there is room for it here (#306).
  elBtnLang.innerHTML = `<span class="lang-flag">${meta.flag}</span><span class="lang-name">${meta.label}</span>`;

  for (const loc of i18n.SUPPORTED_LOCALES) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-option';
    btn.setAttribute('role', 'option');
    btn.dataset.code = loc.code;
    btn.dataset.search = `${loc.label} ${loc.code} ${loc.short}`.toLowerCase();
    btn.setAttribute('aria-selected', String(loc.code === i18n.getLocale()));
    btn.innerHTML = `<span class="lang-flag">${loc.flag}</span><span>${loc.label}</span><span class="lang-code">${loc.short}</span>`;
    btn.addEventListener('click', () => selectLanguage(loc.code));
    li.appendChild(btn);
    elLangList.appendChild(li);
  }

  const closeMenu = () => {
    show(elLangMenu, false);
    elBtnLang.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    const btnRect = elBtnLang.getBoundingClientRect();
    show(elLangMenu, true);
    elBtnLang.setAttribute('aria-expanded', 'true');
    elLangSearch.value = '';
    elLangList.querySelectorAll('li').forEach((li) => show(li, true));
    // .lang-menu is `position: fixed`, so it can't be anchored in CSS. Centred
    // on the modal card rather than the narrow switcher, or it hangs off one
    // edge (setupSortMenu does the same below).
    const modalRect = elBtnLang.closest('.modal').getBoundingClientRect();
    const menuWidth = elLangMenu.offsetWidth;
    const left = Math.max(16, modalRect.left + (modalRect.width - menuWidth) / 2);
    elLangMenu.style.top = `${btnRect.bottom + 6}px`;
    elLangMenu.style.left = `${left}px`;
    elLangSearch.focus();
  };

  elBtnLang.addEventListener('click', () => {
    if (elLangMenu.classList.contains('hidden')) openMenu();
    else closeMenu();
  });
  elLangSearch.addEventListener('input', () => {
    const q = elLangSearch.value.trim().toLowerCase();
    elLangList.querySelectorAll('.lang-option').forEach((opt) => {
      show(opt.parentElement, opt.dataset.search.includes(q));
    });
  });
  document.addEventListener('click', (e) => {
    if (!$('lang-switcher').contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elLangMenu.classList.contains('hidden')) closeMenu();
  });
}

// Mobile's replacement for the native <select> (#275). Selecting an option
// writes elTourSort.value and dispatches its change event, so the sorting logic
// stays in one place.
const SORT_OPTIONS = [
  { value: 'date-desc', i18nKey: 'sort.dateDesc' },
  { value: 'date-asc', i18nKey: 'sort.dateAsc' },
  { value: 'name-asc', i18nKey: 'sort.nameAsc' },
  { value: 'name-desc', i18nKey: 'sort.nameDesc' },
  { value: 'length-desc', i18nKey: 'sort.lengthDesc' },
  { value: 'length-asc', i18nKey: 'sort.lengthAsc' },
];

function setupSortMenu() {
  for (const opt of SORT_OPTIONS) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sort-menu-option';
    btn.setAttribute('role', 'option');
    btn.dataset.value = opt.value;
    btn.textContent = t(opt.i18nKey);
    btn.addEventListener('click', () => {
      elTourSort.value = opt.value;
      elTourSort.dispatchEvent(new Event('change'));
      closeMenu();
    });
    li.appendChild(btn);
    elSortMenuList.appendChild(li);
  }

  const closeMenu = () => {
    show(elSortMenuList, false);
    elBtnSortMenu.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    elSortMenuList.querySelectorAll('.sort-menu-option').forEach((opt) => {
      opt.setAttribute('aria-selected', String(opt.dataset.value === state.sort));
    });
    // `position: fixed` to escape the sidebar's clipping (#294), so the offset
    // has to come from the button's actual viewport rect.
    const rect = elBtnSortMenu.getBoundingClientRect();
    elSortMenuList.style.top = `${rect.bottom + 6}px`;
    elSortMenuList.style.right = `${window.innerWidth - rect.right}px`;
    show(elSortMenuList, true);
    elBtnSortMenu.setAttribute('aria-expanded', 'true');
  };

  elBtnSortMenu.addEventListener('click', () => {
    if (elSortMenuList.classList.contains('hidden')) openMenu();
    else closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!elSortMenu.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elSortMenuList.classList.contains('hidden')) closeMenu();
  });
}

function setupLineStyleMenu() {
  elLineStyleWidth.min = String(WEIGHT_MIN);
  elLineStyleWidth.max = String(WEIGHT_MAX);
  elLineStyleOpacity.min = String(Math.round(OPACITY_MIN * 100));
  elLineStyleOpacity.max = String(Math.round(OPACITY_MAX * 100));

  const applyControls = () => {
    elLineStyleColor.value = state.lineStyle.color;
    elLineStyleWidth.value = String(state.lineStyle.weight);
    elLineStyleWidthValue.textContent = `${state.lineStyle.weight}px`;
    const opacityPct = Math.round(state.lineStyle.opacity * 100);
    elLineStyleOpacity.value = String(opacityPct);
    elLineStyleOpacityValue.textContent = `${opacityPct}%`;
  };
  applyControls();

  const closeMenu = () => {
    show(elLineStyleMenu, false);
    elBtnLineStyle.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    show(elLineStyleMenu, true);
    elBtnLineStyle.setAttribute('aria-expanded', 'true');
  };

  elBtnLineStyle.addEventListener('click', () => {
    if (elLineStyleMenu.classList.contains('hidden')) openMenu();
    else closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!elLineStyleWrap.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elLineStyleMenu.classList.contains('hidden')) closeMenu();
  });

  const updateStyle = (patch) => {
    state.lineStyle = { ...state.lineStyle, ...patch };
    applyControls();
    redrawRoutes();
    saveLineStyle(state.lineStyle);
  };

  elLineStyleColor.addEventListener('input', () => updateStyle({ color: elLineStyleColor.value }));
  elLineStyleWidth.addEventListener('input', () =>
    updateStyle({ weight: Number(elLineStyleWidth.value) }),
  );
  elLineStyleOpacity.addEventListener('input', () =>
    updateStyle({ opacity: Number(elLineStyleOpacity.value) / 100 }),
  );
}

elBtnHelp.addEventListener('click', () => openModal(elHelpModal));
wireModalClose(elHelpModal, $('btn-close-help'), () => closeModal(elHelpModal));
wireModalClose(elProfileModal, $('btn-close-profile'), closeProfile);
wireModalClose(elEditModal, $('btn-close-edit'), closeEdit);
wireModalClose(elUploadModal, $('btn-close-upload'), closeUpload);

wireDropzone(elImageDropzone, elImageFile, uploadImages);
wireDropzone(elDropzone, elUploadFile, ([file]) => selectFile(file));

elLightbox.addEventListener('click', closeLightbox);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!elLightbox.classList.contains('hidden')) return closeLightbox();
    const open = openModalEl();
    if (open) return closeModal(open);
  }
  const open = openModalEl();
  if (open) trapFocus(e, open);
});

(async () => {
  await i18n.init(); // detect locale, load messages, translate the static markup
  setupLanguageSwitcher();
  setupSortMenu();
  setupLineStyleMenu();
  initAuth();
})();
