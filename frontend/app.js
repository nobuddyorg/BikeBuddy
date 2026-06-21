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
const elUserMenu = $('user-menu');
const elUserName = $('user-name');

// ── Auth (placeholder — will be replaced by MSAL + Azure AD B2C) ─────────────

function signIn() {
  // TODO: replace with MSAL signInPopup() once B2C is configured
  onAuthSuccess({ name: 'Matthias', email: 'matthias@example.com', id: 'user-demo' });
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
  const signedIn = !!state.user;
  show(elBtnLogin, !signedIn);
  show(elUserMenu, signedIn);
  elBtnUpload.disabled = !signedIn;
  if (signedIn) elUserName.textContent = state.user.name;
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
    textDiv('tour-item-meta', `${formatDate(tour.date)} · ${tour.distance} km`),
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

// Replaces the current heat layer with one for the given points and fits the view
// to them. Passing no points just clears the layer.
function renderHeatmap(points, padding) {
  clearHeatmap();
  if (points.length === 0) return;

  state.heatLayer = L.heatLayer(points, HEAT_OPTIONS).addTo(map);
  map.fitBounds(
    L.latLngBounds(points.map(([lat, lng]) => [lat, lng])),
    { padding: [padding, padding] },
  );
}

function renderAllHeatmap() {
  const allPoints = state.tours.flatMap((t) => t.heatmapData);
  renderHeatmap(allPoints, 40);
  show(elMapEmpty, allPoints.length === 0);
}

function renderTourHeatmap(tour) {
  show(elMapEmpty, false);
  renderHeatmap(tour.heatmapData, 60);
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

function renderDetailPanel(tour) {
  elDetailName.textContent = tour.name;
  elDetailDate.textContent = formatDate(tour.date);
  elDetailDist.textContent = `${tour.distance} km`;
  elDetailDesc.textContent = tour.description || '';
  show(elDetailPanel, true);
}

// ── Event listeners ───────────────────────────────────────────────────────────

const notifyUploadComingSoon = () => alert('GPX upload coming soon!');

elBtnLogin.addEventListener('click', signIn);
elBtnLoginSidebar.addEventListener('click', signIn);
elBtnLogout.addEventListener('click', signOut);
elBtnCloseDetail.addEventListener('click', deselectTour);
elBtnUpload.addEventListener('click', notifyUploadComingSoon);
elBtnUploadSidebar.addEventListener('click', notifyUploadComingSoon);

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
