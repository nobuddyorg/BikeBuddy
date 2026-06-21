'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  user: null,
  tours: [],
  selectedTourId: null,
  heatLayer: null,
};

// ── Map setup ─────────────────────────────────────────────────────────────────

const map = L.map('map', {
  center: [48.5, 10.5],
  zoom: 6,
  zoomControl: true,
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

// ── DOM refs ──────────────────────────────────────────────────────────────────

const elTourList     = document.getElementById('tour-list');
const elTourCount    = document.getElementById('tour-count');
const elNoTours      = document.getElementById('no-tours');
const elAuthPrompt   = document.getElementById('auth-prompt');
const elMapEmpty     = document.getElementById('map-empty');
const elDetailPanel  = document.getElementById('detail-panel');
const elDetailName   = document.getElementById('detail-name');
const elDetailDate   = document.getElementById('detail-date');
const elDetailDist   = document.getElementById('detail-distance');
const elDetailDesc   = document.getElementById('detail-description');
const elBtnLogin     = document.getElementById('btn-login');
const elBtnLoginSidebar = document.getElementById('btn-login-sidebar');
const elBtnLogout    = document.getElementById('btn-logout');
const elBtnUpload    = document.getElementById('btn-upload');
const elBtnUploadSidebar = document.getElementById('btn-upload-sidebar');
const elBtnCloseDetail = document.getElementById('btn-close-detail');
const elUserMenu     = document.getElementById('user-menu');
const elUserName     = document.getElementById('user-name');

// ── Auth (placeholder — will be replaced by MSAL + Azure AD B2C) ─────────────

function signIn() {
  // TODO: replace with MSAL signInPopup() once B2C is configured
  const mockUser = { name: 'Matthias', email: 'matthias@example.com', id: 'user-demo' };
  onAuthSuccess(mockUser);
}

function signOut() {
  state.user = null;
  state.tours = [];
  state.selectedTourId = null;
  clearHeatmap();
  renderSidebar();
  renderNavAuth();
}

function onAuthSuccess(user) {
  state.user = user;
  renderNavAuth();
  loadTours();
}

function renderNavAuth() {
  if (state.user) {
    elBtnLogin.classList.add('hidden');
    elUserMenu.classList.remove('hidden');
    elUserName.textContent = state.user.name;
    elBtnUpload.disabled = false;
  } else {
    elBtnLogin.classList.remove('hidden');
    elUserMenu.classList.add('hidden');
    elBtnUpload.disabled = true;
  }
}

// ── Tours (placeholder data — will call GET /api/tours) ──────────────────────

function loadTours() {
  // TODO: replace with fetch('/api/tours', { headers: authHeader() })
  state.tours = getDemoTours();
  renderSidebar();
  renderAllHeatmap();
}

function getDemoTours() {
  return [
    {
      id: 'tour-1',
      name: 'Allgäu Loop',
      date: '2026-05-12',
      distance: 287,
      description: 'A classic Allgäu loop via Oberstdorf and the Edelsberg.',
      heatmapData: generateDemoPoints(47.7, 10.3, 180),
    },
    {
      id: 'tour-2',
      name: 'Black Forest Crossing',
      date: '2026-04-28',
      distance: 341,
      description: 'North–south traverse of the Schwarzwald on the B500.',
      heatmapData: generateDemoPoints(48.2, 8.2, 220),
    },
    {
      id: 'tour-3',
      name: 'Bavarian Alps',
      date: '2026-06-01',
      distance: 193,
      description: 'Short but stunning: Garmisch → Zugspitze foothills → Walchensee.',
      heatmapData: generateDemoPoints(47.5, 11.1, 120),
    },
  ];
}

// Generates random GPS points radiating from a center, simulating a route
function generateDemoPoints(centerLat, centerLng, count) {
  const points = [];
  let lat = centerLat;
  let lng = centerLng;
  for (let i = 0; i < count; i++) {
    lat += (Math.random() - 0.48) * 0.02;
    lng += (Math.random() - 0.45) * 0.025;
    points.push([lat, lng, 0.6 + Math.random() * 0.4]);
  }
  return points;
}

// ── Sidebar rendering ─────────────────────────────────────────────────────────

// Build a tour list item with textContent so tour names (user-supplied) can never
// inject markup — no manual HTML escaping needed.
function createTourItem(tour) {
  const li = document.createElement('li');
  li.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');

  const name = document.createElement('div');
  name.className = 'tour-item-name';
  name.textContent = tour.name;

  const meta = document.createElement('div');
  meta.className = 'tour-item-meta';
  meta.textContent = `${formatDate(tour.date)} · ${tour.distance} km`;

  li.append(name, meta);
  li.addEventListener('click', () => selectTour(tour.id));
  return li;
}

function renderSidebar() {
  elTourList.innerHTML = '';

  if (!state.user) {
    elAuthPrompt.classList.remove('hidden');
    elTourList.classList.add('hidden');
    elNoTours.classList.add('hidden');
    elTourCount.textContent = '0';
    return;
  }

  elAuthPrompt.classList.add('hidden');

  if (state.tours.length === 0) {
    elTourList.classList.add('hidden');
    elNoTours.classList.remove('hidden');
    elTourCount.textContent = '0';
    return;
  }

  elNoTours.classList.add('hidden');
  elTourList.classList.remove('hidden');
  elTourCount.textContent = state.tours.length;

  state.tours.forEach(tour => elTourList.appendChild(createTourItem(tour)));

  // Show All button at bottom of list
  const showAll = document.createElement('button');
  showAll.className = 'show-all-btn';
  showAll.textContent = 'Show All Tours';
  showAll.addEventListener('click', () => {
    state.selectedTourId = null;
    renderSidebar();
    renderAllHeatmap();
    elDetailPanel.classList.add('hidden');
  });
  elTourList.appendChild(showAll);
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

// Replaces the current heat layer with one for the given points and fits the
// view to them. Passing no points just clears the layer.
function renderHeatmap(points, padding) {
  clearHeatmap();
  if (points.length === 0) return;

  state.heatLayer = L.heatLayer(points, HEAT_OPTIONS).addTo(map);
  const latLngs = points.map(p => [p[0], p[1]]);
  map.fitBounds(L.latLngBounds(latLngs), { padding: [padding, padding] });
}

function renderAllHeatmap() {
  const allPoints = state.tours.flatMap(t => t.heatmapData);
  renderHeatmap(allPoints, 40);
  elMapEmpty.classList.toggle('hidden', allPoints.length > 0);
}

function renderTourHeatmap(tour) {
  elMapEmpty.classList.add('hidden');
  renderHeatmap(tour.heatmapData, 60);
}

// ── Tour selection ────────────────────────────────────────────────────────────

function selectTour(tourId) {
  state.selectedTourId = tourId;
  const tour = state.tours.find(t => t.id === tourId);
  if (!tour) return;

  renderSidebar();
  renderTourHeatmap(tour);
  renderDetailPanel(tour);
}

function renderDetailPanel(tour) {
  elDetailName.textContent = tour.name;
  elDetailDate.textContent = formatDate(tour.date);
  elDetailDist.textContent = `${tour.distance} km`;
  elDetailDesc.textContent = tour.description || '';
  elDetailPanel.classList.remove('hidden');
}

// ── Event listeners ───────────────────────────────────────────────────────────

elBtnLogin.addEventListener('click', signIn);
elBtnLoginSidebar.addEventListener('click', signIn);
elBtnLogout.addEventListener('click', signOut);
elBtnCloseDetail.addEventListener('click', () => {
  elDetailPanel.classList.add('hidden');
  state.selectedTourId = null;
  renderSidebar();
});
const notifyUploadComingSoon = () => alert('GPX upload coming soon!');
elBtnUpload.addEventListener('click', notifyUploadComingSoon);
elBtnUploadSidebar.addEventListener('click', notifyUploadComingSoon);

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
