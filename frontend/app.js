'use strict';

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
};

// ── Map setup ─────────────────────────────────────────────────────────────────

const map = L.map('map', { center: [48.5, 10.5], zoom: 6 });

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

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
const elImageProgress = $('image-progress');
const elImageProgressBar = $('image-progress-bar');
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
    elBtnProfile.title = state.user.name || state.user.email || 'Account';
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
    toast('Couldn’t load your tours. Check your connection and try again.', 'error');
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
    textDiv('tour-item-meta', `${formatDate(tour.createdAt)} · ${formatDistance(tour.distance)}`),
  );
  li.addEventListener('click', () => selectTour(tour.id));
  return li;
}

// Fuzzy match: every character of the query appears in order in the text
// (case-insensitive). Empty query matches everything.
function fuzzyMatch(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = (text || '').toLowerCase();
  let i = 0;
  for (const ch of t) {
    if (ch === q[i] && ++i === q.length) return true;
  }
  return false;
}

const tourTime = (t) => new Date(t.createdAt).getTime() || 0;
const SORTERS = {
  'date-desc': (a, b) => tourTime(b) - tourTime(a),
  'date-asc': (a, b) => tourTime(a) - tourTime(b),
  'name-asc': (a, b) => (a.name || '').localeCompare(b.name || ''),
  'name-desc': (a, b) => (b.name || '').localeCompare(a.name || ''),
  'length-desc': (a, b) => (b.distance || 0) - (a.distance || 0),
  'length-asc': (a, b) => (a.distance || 0) - (b.distance || 0),
};

// Tours filtered by the search box and ordered by the chosen sort.
function visibleTours() {
  const sorter = SORTERS[state.sort] || SORTERS['date-desc'];
  return state.tours.filter((t) => fuzzyMatch(state.search, t.name)).sort(sorter);
}

function createShowAllButton() {
  const btn = document.createElement('button');
  btn.className = 'show-all-btn';
  btn.textContent = 'Show All Tours';
  btn.addEventListener('click', () => {
    deselectTour();
    renderAllHeatmap();
  });
  return btn;
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
  elTourCount.textContent = signedIn && !loading ? state.tours.length : '0';

  elTourList.innerHTML = '';
  if (!hasTours) return;

  const visible = visibleTours();
  if (visible.length === 0) {
    elTourList.appendChild(textDiv('tour-empty', 'No tours match your search.'));
    return;
  }
  visible.forEach((tour) => elTourList.appendChild(createTourItem(tour)));
  elTourList.appendChild(createShowAllButton());
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

// ── Photo pins (#100) ─────────────────────────────────────────────────────────

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

function clearPins() {
  if (state.pinLayer) {
    map.removeLayer(state.pinLayer);
    state.pinLayer = null;
  }
}

// Group images that share (almost) the same spot so co-located pins can be
// fanned out instead of stacking on top of each other (#126). ~4 decimals ≈ 11m.
function groupByLocation(images) {
  const groups = new Map();
  for (const img of images) {
    const key = `${img.lat.toFixed(4)},${img.lon.toFixed(4)}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(img);
  }
  return [...groups.values()];
}

// Small circular offsets (in degrees) so each pin in a co-located group is
// individually visible and clickable. A single pin stays exactly on its spot.
function fanOffsets(n) {
  if (n <= 1) return [[0, 0]];
  const r = 0.0002;
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return [r * Math.cos(angle), r * Math.sin(angle)];
  });
}

function makePinMarker(img, dLat, dLon) {
  const marker = L.marker([img.lat + dLat, img.lon + dLon], { icon: photoPinIcon(img.url) });
  marker.on('click', () => openLightbox(img.url));
  return marker;
}

// The toggle is hidden unless some photo has coordinates; the layer is only
// added when the toggle is on (default off, per #100).
function renderPins() {
  clearPins();
  const images = geotaggedImages();
  show(elPinToggle, images.length > 0);
  if (!state.showPins || images.length === 0) return;

  const markers = groupByLocation(images).flatMap((group) => {
    const offsets = fanOffsets(group.length);
    return group.map((img, i) => makePinMarker(img, offsets[i][0], offsets[i][1]));
  });
  state.pinLayer = L.layerGroup(markers).addTo(map);
}

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
      elEditError.textContent = parseErrorMessage(await res.text(), 'Could not save changes.');
      show(elEditError, true);
      return;
    }
    const updated = await res.json();
    Object.assign(tour, { name: updated.name, description: updated.description });
    closeEdit();
    renderSidebar();
    renderDetailPanel(tour);
  } catch {
    elEditError.textContent = 'Network error.';
    show(elEditError, true);
  }
}

async function deleteSelectedTour() {
  const id = state.selectedTourId;
  if (!id) return;
  if (!confirm('Delete this tour? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    state.tours = state.tours.filter((t) => t.id !== id);
    deselectTour();
    renderSidebar();
    await renderAllHeatmap();
    toast('Tour deleted.', 'success');
  } catch {
    toast('Could not delete the tour.', 'error');
  }
}

function renderDetailPanel(tour) {
  elDetailName.textContent = tour.name;
  elDetailDate.textContent = formatDate(tour.createdAt);
  elDetailDist.textContent = formatDistance(tour.distance);
  elDetailDesc.textContent = tour.description || '';
  resetImageSection();
  show(elDetailPanel, true);
  refreshMapSize();
}

// ── Tour images (upload) ──────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function resetImageSection() {
  elImageGrid.innerHTML = '';
  show(elImageProgress, false);
  show(elImageError, false);
  elImageProgressBar.style.width = '0%';
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
  del.setAttribute('aria-label', 'Delete photo');
  del.textContent = '✕';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteImage(image.id, fig);
  });

  fig.append(img, del);
  return fig;
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
  if (!confirm('Delete this photo?')) return;
  const tourId = state.selectedTourId;
  try {
    const res = await apiFetch(`/api/tours/${tourId}/images/${imageId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    tileEl.remove();
    const tour = state.tours.find((t) => t.id === tourId);
    if (tour?.images) tour.images = tour.images.filter((i) => i.id !== imageId);
  } catch {
    showImageError('Could not delete the photo.');
  }
}

function showImageError(message) {
  elImageError.textContent = message;
  show(elImageError, true);
}

async function uploadImage(file) {
  show(elImageError, false);
  const tourId = state.selectedTourId;
  if (!file || !tourId) return;
  if (!/^image\/(jpeg|png)$/.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
    showImageError('Only JPEG or PNG images are accepted.');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    showImageError('Image exceeds the 10 MB limit.');
    return;
  }

  const token = await getAccessToken();
  show(elImageProgress, true);
  elImageProgressBar.style.width = '0%';
  try {
    const image = await xhrUpload(`${API_BASE}/api/tours/${tourId}/images`, file, token, (p) => {
      elImageProgressBar.style.width = `${p}%`;
    });
    const tour = state.tours.find((t) => t.id === tourId);
    if (tour) tour.images = [...(tour.images || []), image];
    elImageGrid.appendChild(createImageTile(image));
    renderPins(); // a newly uploaded geotagged photo may add a marker
  } catch (err) {
    showImageError(err.message);
  } finally {
    show(elImageProgress, false);
  }
}

// ── Profile modal ─────────────────────────────────────────────────────────────

// Avatar initials from the email local part (e.g. "ada.lovelace@x" → "AD").
// Avatar initials: prefer the display name (one word → its first letter; more
// words → first letter of the first + last word); fall back to the email.
function initials(nameOrEmail) {
  if (!nameOrEmail) return '?';
  const source = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

function renderProfile() {
  elProfileTitle.textContent = state.user.name || 'Your account';
  elProfileAvatar.textContent = initials(state.user.name || state.user.email);
  elProfileEmail.textContent = state.user.email || '—';
  elProfileSince.textContent = state.user.createdAt ? formatDate(state.user.createdAt) : '—';
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
      elProfileNameError.textContent = parseErrorMessage(
        await res.text(),
        'Could not save your name.',
      );
      show(elProfileNameError, true);
      return;
    }
    state.user = { ...state.user, ...(await res.json()) };
    renderProfile();
    renderNavAuth();
    toast('Name updated.', 'success');
  } catch {
    elProfileNameError.textContent = 'Network error.';
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
    toast('Your data export has been downloaded.', 'success');
  } catch {
    toast('Could not export your data.', 'error');
  }
}

// GDPR: permanently delete the account and all data, then sign out.
async function deleteMyAccount() {
  if (
    !confirm(
      'Permanently delete your account? Your tours and photos are removed immediately; ' +
        'your sign-in is fully removed shortly after. This cannot be undone.',
    )
  )
    return;
  try {
    const res = await apiFetch('/api/account', { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    closeProfile();
    toast('Your data has been deleted. Your login will be fully removed shortly.', 'success');
    await signOut();
  } catch {
    toast('Could not delete your account. Please try again.', 'error');
  }
}

// ── Upload modal ──────────────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
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
  if (!file.name.toLowerCase().endsWith('.gpx')) {
    showUploadError('Only .gpx files are accepted.');
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    showUploadError('File exceeds the 10 MB limit.');
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
    toast('Tour uploaded.', 'success');
  } catch (err) {
    showUploadError(err.message);
    show(elUploadProgress, false);
    elBtnSubmitUpload.disabled = false;
  }
}

// ── DOM wiring helpers ──────────────────────────────────────────────────────────

// Wire a click / keyboard / drag-drop dropzone to a hidden file input.
function wireDropzone(zone, input, onFile) {
  input.addEventListener('change', () => {
    onFile(input.files[0]);
    input.value = ''; // allow re-selecting the same file
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
    onFile(e.dataTransfer.files[0]);
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
  renderSidebar();
});
elTourSort.addEventListener('change', () => {
  state.sort = elTourSort.value;
  renderSidebar();
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
  elBtnMapExpand.title = expanded ? 'Restore panels' : 'Expand map';
  refreshMapSize();
});

elBtnHelp.addEventListener('click', () => openModal(elHelpModal));
wireModalClose(elHelpModal, $('btn-close-help'), () => closeModal(elHelpModal));
wireModalClose(elProfileModal, $('btn-close-profile'), closeProfile);
wireModalClose(elEditModal, $('btn-close-edit'), closeEdit);
wireModalClose(elUploadModal, $('btn-close-upload'), closeUpload);

wireDropzone(elImageDropzone, elImageFile, uploadImage);
wireDropzone(elDropzone, elUploadFile, selectFile);

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

initAuth();

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDistance(km) {
  if (typeof km !== 'number') return '—';
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
