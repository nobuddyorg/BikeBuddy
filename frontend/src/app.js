'use strict';

import { formatDate, formatDistance, initials } from './lib/format.js';
import { visibleTours, paginate, PAGE_SIZE } from './lib/tours.js';
import {
  validateGpxUpload,
  validateImageUpload,
  validateImageBatch,
  validateImageQuota,
} from './lib/files.js';
import { runWithConcurrency } from './lib/concurrency.js';
import { groupByProximity, fanOffsets } from './lib/pinLayout.js';
import * as i18n from './lib/i18n.js';

const t = i18n.t;

// Globals provided by classic <script>s loaded before this module: config.js
// (BIKEBUDDY_CONFIG), the vendored MSAL bundle, and Leaflet + its heat plugin.
const BIKEBUDDY_CONFIG = window.BIKEBUDDY_CONFIG || {};
const msal = window.msal;
const L = window.L;

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  user: null,
  tours: [],
  selectedTourId: null,
  heatLayer: null,
  pinLayer: null,
  showPins: false,
  loadingTours: false,
  sort: 'date-desc',
  search: '',
  page: 1,
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

// Leaflet tile URLs are JS state (unlike the CSS palette, which the browser
// switches natively via prefers-color-scheme) — mirror the OS setting here so
// the basemap matches the rest of the UI, including live theme changes.
function applyMapTheme(isDark) {
  tileLayer.setUrl(isDark ? TILE_URLS.dark : TILE_URLS.light);
}

const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
applyMapTheme(darkMediaQuery.matches);
darkMediaQuery.addEventListener('change', (e) => applyMapTheme(e.matches));

// Leaflet caches the container size, so when the detail panel opens/closes (or
// the window resizes) the map keeps its old width and leaves gray space. Recompute
// after the layout has reflowed.
function refreshMapSize() {
  requestAnimationFrame(() => map.invalidateSize());
}
window.addEventListener('resize', refreshMapSize);

// ── DOM helpers + refs ──────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const show = (el, visible) => el.classList.toggle('hidden', !visible);

// Non-blocking notification. type: 'info' | 'error' | 'success'. Click or wait
// to dismiss. Used instead of alert() and for surfacing otherwise-silent errors.
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
const elTourPager = $('tour-pager');
const elTourPagerPrev = $('tour-pager-prev');
const elTourPagerLabel = $('tour-pager-label');
const elTourPagerNext = $('tour-pager-next');
const elBtnShowAll = $('btn-show-all');
const elPinToggle = $('pin-toggle');
const elPinToggleInput = $('pin-toggle-input');
const elBtnMapExpand = $('btn-map-expand');
const elAppLayout = document.querySelector('.app-layout');
const elAuthPrompt = $('auth-prompt');
const elMapEmpty = $('map-empty');
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
const elImageGrid = $('tour-image-grid');
const elImageDropzone = $('image-dropzone');
const elImageFile = $('image-file');
const elImageError = $('image-error');
const elLightbox = $('lightbox');
const elLightboxImg = $('lightbox-img');
const elEditModal = $('edit-modal');
const elEditForm = $('edit-form');
const elEditName = $('edit-name');
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

// Use the no-auth dev path when devMode is set OR External ID isn't configured
// yet. Pairs with the backend's SKIP_AUTH so the app stays usable before — and
// flips to real auth the moment — the tenant details are provided.
const USE_DEV_AUTH =
  BIKEBUDDY_CONFIG.devMode || !(BIKEBUDDY_CONFIG.entraSubdomain && BIKEBUDDY_CONFIG.entraClientId);

// In dev mode there's no real session, so remember an explicit sign-out to keep
// the user logged out across refreshes (real auth persists via MSAL's cache).
const DEV_SIGNED_OUT_KEY = 'bb-dev-signed-out';

// ── Dev mode (BIKEBUDDY_CONFIG.devMode = true) ────────────────────────────────
// Skips MSAL. With the backend running (SKIP_AUTH=true), it calls the real
// /api/me so login exercises the Functions API + Cosmos emulator. If the API
// isn't reachable (e.g. frontend opened from file://), it falls back to a
// synthetic user so the UI is still usable offline.

const SYNTHETIC_USER = {
  id: 'local-dev-user',
  name: 'Local Dev',
  email: 'dev@localhost',
  createdAt: new Date().toISOString(),
};

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
    // localStorage: keep the user signed in across tab close/reopen (token still
    // expires normally; sign-out clears it). Supersedes the earlier sessionStorage
    // choice (#146).
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
  });
  await msalClient.initialize();

  // Restore a cached session after a refresh so the user isn't asked to sign in
  // again (token is reacquired silently on the first API call).
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
    // user cancelled popup or popup was blocked — no-op
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
  clearHeatmap();
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

// Render the signed-in UI synchronously (so the Sign In prompt never lingers
// behind the tours request), then load tours and hydrate the canonical user.
function renderSignedIn() {
  state.loadingTours = true;
  renderNavAuth();
  renderSidebar();
  loadTours();
  refreshUser();
}

// The user doc (id, name, email, createdAt) is the source of truth; token
// claims can be missing right after sign-up (e.g. name), so merge it in once
// loaded. Uses apiFetch → API_BASE (a relative URL would hit the Pages origin).
async function refreshUser() {
  try {
    const res = await apiFetch('/api/me');
    if (!res.ok) return;
    state.user = { ...state.user, ...(await res.json()) };
    renderNavAuth();
  } catch {
    // network unavailable — keep token-derived values
  }
}

function renderNavAuth() {
  const signedIn = !!state.user;
  show(elBtnLogin, !signedIn);
  show(elUserMenu, signedIn);
  elBtnUpload.disabled = !signedIn;
  // Compact circular avatar (display-name initials, falling back to email)
  // keeps the header small on mobile; the full name/email live in the modal.
  if (signedIn) {
    elBtnProfile.textContent = initials(state.user.name || state.user.email);
    elBtnProfile.classList.add('btn-avatar');
    elBtnProfile.title = state.user.name || state.user.email || t('common.account');
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

// fetch wrapper that attaches the bearer token when one is available
// (in devMode getAccessToken() returns null and the backend accepts the request).
const API_BASE = BIKEBUDDY_CONFIG.apiBaseUrl || '';

async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(API_BASE + path, { ...options, headers });
}

// Extract a friendly message from a JSON `{ error }` body, falling back if not JSON.
function parseErrorMessage(text, fallback) {
  try {
    return JSON.parse(text).error || fallback;
  } catch {
    return fallback;
  }
}

// POST a single file as multipart with progress reporting. Resolves with the
// parsed JSON body on 201, rejects with an Error carrying a friendly message.
function xhrUpload(url, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () =>
      xhr.status === 201
        ? resolve(JSON.parse(xhr.responseText))
        : reject(new Error(parseErrorMessage(xhr.responseText, 'Upload failed.')));
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send(fd);
  });
}

// ── Tours ───────────────────────────────────────────────────────────────────

async function loadTours() {
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
  await renderAllHeatmap();
}

// Fetch + cache the detail fields (heatmapData, images) not present in the list.
async function ensureDetail(tour) {
  if (tour.heatmapData && tour.images) return;
  try {
    const res = await apiFetch(`/api/tours/${tour.id}`);
    if (res.ok) {
      const detail = await res.json();
      tour.heatmapData = detail.heatmapData || [];
      tour.images = detail.images || [];
    }
  } catch {
    // network unavailable — fall back to empty so callers don't break
  }
  tour.heatmapData = tour.heatmapData || [];
  tour.images = tour.images || [];
}

// ── Sidebar rendering ─────────────────────────────────────────────────────────

// textContent (not innerHTML) so user-supplied tour names can never inject markup.
function textDiv(className, text) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

function createTourItem(tour) {
  const li = document.createElement('li');
  li.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');
  li.append(
    textDiv('tour-item-name', tour.name),
    textDiv(
      'tour-item-meta',
      `${formatDate(tour.createdAt, i18n.dateLocale())} · ${formatDistance(tour.distance)}`,
    ),
  );
  li.addEventListener('click', () => selectTour(tour.id));
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
  show(elTourList, hasTours);
  show(elBtnShowAll, hasTours);
  elTourCount.textContent = signedIn && !loading ? state.tours.length : '0';

  elTourList.innerHTML = '';
  if (!hasTours) {
    show(elTourPager, false);
    return;
  }

  const visible = visibleTours(state.tours, state.sort, state.search);
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

// ── Heatmap rendering ─────────────────────────────────────────────────────────

// Tuning: previously max(0.4) < per-point intensity(0.6), so even a single pass
// saturated to the hottest colour. With max=1.0 and a lower per-point intensity
// a single pass sits at the cool end and only overlapping passes heat up — the
// dynamic-range "stretch" is preserved. minOpacity keeps sparse segments visible.
const HEAT_OPTIONS = {
  radius: 16,
  blur: 20,
  minOpacity: 0.45,
  max: 1.0,
  maxZoom: 17,
  gradient: { 0.0: '#3b82f6', 0.3: '#22d3ee', 0.55: '#f97316', 0.8: '#ef4444', 1.0: '#fde047' },
};

function clearHeatmap() {
  if (state.heatLayer) {
    map.removeLayer(state.heatLayer);
    state.heatLayer = null;
  }
}

// heatmapData from the API is [[lat, lon], ...]; add a fixed intensity so the
// gradient renders consistently with HEAT_OPTIONS.max.
const toHeatPoints = (heatmapData) => (heatmapData || []).map(([lat, lon]) => [lat, lon, 0.4]);

// Replaces the current heat layer with one for the given points and fits the view
// to them. Passing no points just clears the layer.
function renderHeatmap(points, padding) {
  clearHeatmap();
  if (points.length === 0) return;

  state.heatLayer = L.heatLayer(points, HEAT_OPTIONS).addTo(map);
  // latLngBounds reads [lat, lng] from each [lat, lng, intensity] point and ignores the rest.
  map.fitBounds(L.latLngBounds(points), { padding: [padding, padding] });
}

async function renderAllHeatmap() {
  await Promise.all(state.tours.map(ensureDetail));
  const allPoints = state.tours.flatMap((t) => toHeatPoints(t.heatmapData));
  renderHeatmap(allPoints, 40);
  show(elMapEmpty, allPoints.length === 0);
  renderPins();
}

// ── Photo pins (#100, #210) ─────────────────────────────────────────────────

const PIN_GROUP_THRESHOLD_PX = 24;
const PIN_FAN_RADIUS_PX = 16;
const PIN_MIN_ZOOM = 8;

// Geotagged images across all loaded tours (lat/lon come from the detail fetch).
function geotaggedImages() {
  return state.tours.flatMap((t) =>
    (t.images || []).filter((img) => typeof img.lat === 'number' && typeof img.lon === 'number'),
  );
}

function photoPinIcon(url) {
  return L.divIcon({
    className: 'photo-pin',
    html: `<img src="${url}" alt="Tour photo" />`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// imageId → live L.Marker. Kept across renderPins() calls so a re-render
// (e.g. on zoomend) repositions existing markers instead of destroying and
// recreating their DOM (including the <img> inside each icon), which was
// visibly flickering pins on every zoom step.
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

// The toggle is hidden unless some photo has coordinates; the layer is only
// added when the toggle is on (default off, per #100). Grouping/fanning
// happens in screen-pixel space at the current zoom (#210), so pins that
// visually overlap fan out, and separate/re-collapse live as the user zooms
// (re-triggered by the zoomend listener below). Below PIN_MIN_ZOOM, unrelated
// photos from different tours/regions can end up in the same proximity group
// and clutter the fixed-radius fan, so pins are hidden entirely until the
// user zooms in far enough for them to be individually meaningful (#236).
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

map.on('zoomend', renderPins);

// ── Tour selection ────────────────────────────────────────────────────────────

async function selectTour(tourId) {
  const tour = state.tours.find((t) => t.id === tourId);
  if (!tour) return;

  state.selectedTourId = tourId;
  renderSidebar();
  renderDetailPanel(tour); // name/meta now; resets the image section
  await ensureDetail(tour);
  if (state.selectedTourId !== tourId) return; // user switched while loading
  show(elMapEmpty, false);
  renderHeatmap(toHeatPoints(tour.heatmapData), 60);
  renderGallery(tour);
  renderPins();
}

function deselectTour() {
  state.selectedTourId = null;
  show(elDetailPanel, false);
  refreshMapSize();
  renderSidebar();
}

function openEdit() {
  const tour = state.tours.find((t) => t.id === state.selectedTourId);
  if (!tour) return;
  elEditName.value = tour.name || '';
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
      }),
    });
    if (!res.ok) {
      elEditError.textContent = parseErrorMessage(await res.text(), t('errors.saveChanges'));
      show(elEditError, true);
      return;
    }
    const updated = await res.json();
    Object.assign(tour, { name: updated.name, description: updated.description });
    closeEdit();
    renderSidebar();
    renderDetailPanel(tour);
  } catch {
    elEditError.textContent = t('errors.network');
    show(elEditError, true);
  }
}

async function deleteSelectedTour() {
  const id = state.selectedTourId;
  if (!id) return;
  if (!confirm(t('confirm.deleteTour'))) return;
  try {
    const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    state.tours = state.tours.filter((t) => t.id !== id);
    deselectTour();
    renderSidebar();
    await renderAllHeatmap();
    toast(t('toast.tourDeleted'), 'success');
  } catch {
    toast(t('toast.tourDeleteError'), 'error');
  }
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

// A thumbnail with a click-to-open lightbox and a delete overlay button.
function createImageTile(image) {
  const fig = document.createElement('figure');
  fig.className = 'image-tile';

  const img = document.createElement('img');
  img.className = 'image-thumb';
  img.src = image.url;
  img.alt = 'Tour photo';
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

// A grid tile representing one in-flight upload: starts pending (progress
// ring), can move to error (message + retry/dismiss) or done (swaps to the
// same markup createImageTile produces).
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

// Uploads a batch of files with at most 3 in flight at once. Each file gets
// its own placeholder tile in #tour-image-grid immediately; client-invalid
// files never hit the network. Reuses the single-image endpoint, called once
// per file — see docs/superpowers/specs/2026-07-03-multi-image-upload-design.md.
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

  // Join date lives on the user doc; hydrate if the login session lacked it.
  if (!state.user.createdAt) {
    await refreshUser();
    renderProfile();
  }
}

function closeProfile() {
  closeModal(elProfileModal);
}

// Save an edited display name to the user doc (PATCH /api/me).
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

// GDPR: download all of the user's data as JSON.
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

// GDPR: permanently delete the account and all data, then sign out.
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
    selectTour(tourId); // success → jump to the new tour's heatmap
    toast(t('toast.tourUploaded'), 'success');
  } catch (err) {
    showUploadError(err.message);
    show(elUploadProgress, false);
    elBtnSubmitUpload.disabled = false;
  }
}

// ── DOM wiring helpers ──────────────────────────────────────────────────────────

// Wire a click / keyboard / drag-drop dropzone to a hidden file input.
// onFiles receives an array of File — callers that only want one file
// destructure the first element (see the GPX wireDropzone call site).
function wireDropzone(zone, input, onFiles) {
  input.addEventListener('change', () => {
    onFiles(Array.from(input.files));
    input.value = ''; // allow re-selecting the same file(s)
  });
  // The input is nested inside the zone; ignore the click it bubbles back up,
  // otherwise input.click() re-enters this handler and the browser blocks the dialog.
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

// Open a modal accessibly: remember focus, reveal it, move focus inside.
function openModal(modal) {
  modalReturnFocus = document.activeElement;
  show(modal, true);
  const focusables = modal.querySelectorAll(FOCUSABLE);
  (focusables[focusables.length > 1 ? 1 : 0] || modal).focus();
}

// Close a modal and restore focus to whatever opened it.
function closeModal(modal) {
  show(modal, false);
  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  modalReturnFocus = null;
}

const openModalEl = () => document.querySelector('.modal-overlay:not(.hidden)');

// Keep Tab focus inside the open modal.
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

// Close a modal via its close button or a click on the backdrop.
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
elBtnCloseDetail.addEventListener('click', deselectTour);
elBtnDeleteTour.addEventListener('click', deleteSelectedTour);
elBtnEditTour.addEventListener('click', openEdit);
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
  renderAllHeatmap();
});
elPinToggleInput.addEventListener('change', () => {
  state.showPins = elPinToggleInput.checked;
  renderPins();
});

// The browser may restore the checkbox's checked state on reload while JS state
// resets to false — sync them so pins render without an off/on dance (#145).
elPinToggleInput.checked = state.showPins;

// Expand the map to (near) full screen by collapsing the side panels (#143).
elBtnMapExpand.addEventListener('click', () => {
  const expanded = elAppLayout.classList.toggle('map-expanded');
  elBtnMapExpand.setAttribute('aria-pressed', String(expanded));
  elBtnMapExpand.title = expanded ? t('map.restoreTitle') : t('map.expandTitle');
  refreshMapSize();
});

// Language switcher: flag + code preview in the navbar, opening a searchable
// list of flags. Selecting a language persists it and reloads (i18n.setLanguage).
function setupLanguageSwitcher() {
  const elBtnLang = $('btn-lang');
  const elLangMenu = $('lang-menu');
  const elLangSearch = $('lang-search');
  const elLangList = $('lang-list');
  const meta = i18n.getLocaleMeta();
  elBtnLang.innerHTML = `<span class="lang-flag">${meta.flag}</span><span class="lang-code">${meta.short}</span>`;

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
    btn.addEventListener('click', () => i18n.setLanguage(loc.code));
    li.appendChild(btn);
    elLangList.appendChild(li);
  }

  const closeMenu = () => {
    show(elLangMenu, false);
    elBtnLang.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    show(elLangMenu, true);
    elBtnLang.setAttribute('aria-expanded', 'true');
    elLangSearch.value = '';
    elLangList.querySelectorAll('li').forEach((li) => show(li, true));
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
  initAuth();
})();
