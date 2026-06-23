'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  user: null,
  tours: [],
  selectedTourId: null,
  heatLayer: null,
};

// ── Map setup ─────────────────────────────────────────────────────────────────

const map = L.map('map', { center: [48.5, 10.5], zoom: 6 });

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

// ── DOM helpers + refs ──────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const show = (el, visible) => el.classList.toggle('hidden', !visible);

const elTourList = $('tour-list');
const elTourCount = $('tour-count');
const elNoTours = $('no-tours');
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
const elUserMenu = $('user-menu');
const elBtnProfile = $('btn-profile');
const elProfileModal = $('profile-modal');
const elProfileAvatar = $('profile-avatar');
const elProfileName = $('profile-modal-title');
const elProfileEmail = $('profile-email');
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

// ── Auth (Azure AD B2C via MSAL Browser) ─────────────────────────────────────

let msalClient;

const LOGIN_SCOPES = { scopes: ['openid', BIKEBUDDY_CONFIG.b2cApiScope] };

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
    const res = await fetch('/api/me');
    state.user = res.ok ? await res.json() : SYNTHETIC_USER;
  } catch {
    state.user = SYNTHETIC_USER;
  }
  renderNavAuth();
  loadTours();
}

// ─────────────────────────────────────────────────────────────────────────────

async function initAuth() {
  if (BIKEBUDDY_CONFIG.devMode) { await devSignIn(); return; }
  const tenantName = BIKEBUDDY_CONFIG.b2cTenant.split('.')[0];
  msalClient = new msal.PublicClientApplication({
    auth: {
      clientId: BIKEBUDDY_CONFIG.b2cClientId,
      authority: `https://${tenantName}.b2clogin.com/${BIKEBUDDY_CONFIG.b2cTenant}/${BIKEBUDDY_CONFIG.b2cPolicy}`,
      knownAuthorities: [`${tenantName}.b2clogin.com`],
    },
    // memoryStorage: token is lost on page refresh (no localStorage per security policy)
    cache: { cacheLocation: 'memoryStorage', storeAuthStateInCookie: false },
  });
  await msalClient.initialize();
  renderNavAuth();
}

async function signIn() {
  if (BIKEBUDDY_CONFIG.devMode) { await devSignIn(); return; }
  try {
    onAuthSuccess(await msalClient.loginPopup(LOGIN_SCOPES));
  } catch {
    // user cancelled popup or popup was blocked — no-op
  }
}

async function signOut() {
  if (!BIKEBUDDY_CONFIG.devMode) {
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
  renderSidebar();
  renderNavAuth();
}

async function getAccessToken() {
  if (BIKEBUDDY_CONFIG.devMode) return null;
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
    name: result.account.name || result.idTokenClaims?.name || result.idTokenClaims?.given_name || null,
    email: result.idTokenClaims?.emails?.[0] || result.account.username,
  };
  renderNavAuth();
  loadTours();
}

function renderNavAuth() {
  const signedIn = !!state.user;
  show(elBtnLogin, !signedIn);
  show(elUserMenu, signedIn);
  elBtnUpload.disabled = !signedIn;
  if (signedIn) elBtnProfile.textContent = state.user.name || state.user.email || 'Profile';
}

// ── API ───────────────────────────────────────────────────────────────────────

// fetch wrapper that attaches the bearer token when one is available
// (in devMode getAccessToken() returns null and the backend accepts the request).
async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

// ── Tours ───────────────────────────────────────────────────────────────────

async function loadTours() {
  try {
    const res = await apiFetch('/api/tours');
    state.tours = res.ok ? await res.json() : [];
  } catch {
    state.tours = [];
  }
  renderSidebar();
  await renderAllHeatmap();
}

// heatmapData lives only on the detail endpoint; fetch + cache it on the tour.
async function ensureHeatmap(tour) {
  if (tour.heatmapData) return tour.heatmapData;
  try {
    const res = await apiFetch(`/api/tours/${tour.id}`);
    if (res.ok) tour.heatmapData = (await res.json()).heatmapData || [];
  } catch {
    tour.heatmapData = [];
  }
  return tour.heatmapData || [];
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
  const hasTours = signedIn && state.tours.length > 0;

  show(elAuthPrompt, !signedIn);
  show(elNoTours, signedIn && !hasTours);
  show(elTourList, hasTours);
  elTourCount.textContent = signedIn ? state.tours.length : '0';

  elTourList.innerHTML = '';
  if (!hasTours) return;

  state.tours.forEach((tour) => elTourList.appendChild(createTourItem(tour)));
  elTourList.appendChild(createShowAllButton());
}

// ── Heatmap rendering ─────────────────────────────────────────────────────────

const HEAT_OPTIONS = {
  radius: 18,
  blur: 22,
  minOpacity: 0.5,
  max: 0.4,
  maxZoom: 17,
  gradient: { 0.0: '#3b82f6', 0.4: '#f97316', 0.7: '#ef4444', 1.0: '#fde047' },
};

function clearHeatmap() {
  if (state.heatLayer) {
    map.removeLayer(state.heatLayer);
    state.heatLayer = null;
  }
}

// heatmapData from the API is [[lat, lon], ...]; add a fixed intensity so the
// gradient renders consistently with HEAT_OPTIONS.max.
const toHeatPoints = (heatmapData) => (heatmapData || []).map(([lat, lon]) => [lat, lon, 0.6]);

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
  await Promise.all(state.tours.map(ensureHeatmap));
  const allPoints = state.tours.flatMap((t) => toHeatPoints(t.heatmapData));
  renderHeatmap(allPoints, 40);
  show(elMapEmpty, allPoints.length === 0);
}

async function renderTourHeatmap(tour) {
  await ensureHeatmap(tour);
  show(elMapEmpty, false);
  renderHeatmap(toHeatPoints(tour.heatmapData), 60);
}

// ── Tour selection ────────────────────────────────────────────────────────────

function selectTour(tourId) {
  const tour = state.tours.find((t) => t.id === tourId);
  if (!tour) return;

  state.selectedTourId = tourId;
  renderSidebar();
  renderTourHeatmap(tour);
  renderDetailPanel(tour);
}

function deselectTour() {
  state.selectedTourId = null;
  show(elDetailPanel, false);
  renderSidebar();
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
  } catch {
    alert('Could not delete the tour.');
  }
}

function renderDetailPanel(tour) {
  elDetailName.textContent = tour.name;
  elDetailDate.textContent = formatDate(tour.createdAt);
  elDetailDist.textContent = formatDistance(tour.distance);
  elDetailDesc.textContent = tour.description || '';
  show(elDetailPanel, true);
}

// ── Profile modal ─────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

async function openProfile() {
  if (!state.user) return;

  function renderProfile() {
    elProfileAvatar.textContent = initials(state.user.name);
    elProfileName.textContent = state.user.name || state.user.email || '—';
    elProfileEmail.textContent = state.user.email || '—';
    elProfileSince.textContent = state.user.createdAt ? formatDate(state.user.createdAt) : '—';
  }

  renderProfile();
  show(elProfileModal, true);

  if (!state.user.createdAt) {
    try {
      const token = await getAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/me', { headers });
      if (res.ok) {
        const data = await res.json();
        state.user.name = data.name || state.user.name;
        state.user.email = data.email || state.user.email;
        state.user.createdAt = data.createdAt;
        renderProfile();
        renderNavAuth();
      }
    } catch {
      // network unavailable — leave "—" placeholder
    }
  }
}

function closeProfile() {
  show(elProfileModal, false);
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
  show(elUploadModal, true);
}

function closeUpload() {
  show(elUploadModal, false);
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
  const fd = new FormData();
  fd.append('file', selectedFile, selectedFile.name);

  elBtnSubmitUpload.disabled = true;
  show(elUploadError, false);
  show(elUploadProgress, true);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/api/tours/upload?${params.toString()}`);
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

  xhr.upload.onprogress = (ev) => {
    if (ev.lengthComputable) {
      elUploadProgressBar.style.width = `${Math.round((ev.loaded / ev.total) * 100)}%`;
    }
  };

  xhr.onload = async () => {
    if (xhr.status === 201) {
      const { tourId } = JSON.parse(xhr.responseText);
      closeUpload();
      await loadTours();
      selectTour(tourId); // success → jump to the new tour's heatmap
    } else {
      let msg = 'Upload failed.';
      try {
        msg = JSON.parse(xhr.responseText).error || msg;
      } catch {
        // non-JSON error body — keep the generic message
      }
      showUploadError(msg);
      show(elUploadProgress, false);
      elBtnSubmitUpload.disabled = false;
    }
  };

  xhr.onerror = () => {
    showUploadError('Network error during upload.');
    show(elUploadProgress, false);
    elBtnSubmitUpload.disabled = false;
  };

  xhr.send(fd);
}

// ── Event listeners ───────────────────────────────────────────────────────────

elBtnLogin.addEventListener('click', signIn);
elBtnLoginSidebar.addEventListener('click', signIn);
elBtnLogout.addEventListener('click', signOut);
elBtnProfile.addEventListener('click', openProfile);
$('btn-close-profile').addEventListener('click', closeProfile);
elProfileModal.addEventListener('click', (e) => {
  if (e.target === elProfileModal) closeProfile();
});
elBtnCloseDetail.addEventListener('click', deselectTour);
elBtnDeleteTour.addEventListener('click', deleteSelectedTour);
elBtnUpload.addEventListener('click', openUpload);
elBtnUploadSidebar.addEventListener('click', openUpload);

$('btn-close-upload').addEventListener('click', closeUpload);
elUploadModal.addEventListener('click', (e) => {
  if (e.target === elUploadModal) closeUpload();
});
elUploadForm.addEventListener('submit', submitUpload);
elUploadFile.addEventListener('change', () => selectFile(elUploadFile.files[0]));
elDropzone.addEventListener('click', () => elUploadFile.click());
elDropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    elUploadFile.click();
  }
});
elDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  elDropzone.classList.add('dragover');
});
elDropzone.addEventListener('dragleave', () => elDropzone.classList.remove('dragover'));
elDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  elDropzone.classList.remove('dragover');
  selectFile(e.dataTransfer.files[0]);
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
