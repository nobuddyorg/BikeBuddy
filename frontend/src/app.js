import * as i18n from './ui/i18n.js';
import { state } from './ui/state.js';
import { map, refreshMapSize, moveMapIntoDetailPanel, restoreMapToAppLayout } from './ui/map.js';
import * as dom from './ui/dom.js';
import { signIn, signOut, initAuth } from './ui/auth.js';
import {
  openProfile,
  saveProfileName,
  downloadMyData,
  deleteMyAccount,
  closeProfile,
  openDeleteAccountModal,
  closeDeleteAccountModal,
  updateDeleteAccountConfirmState,
} from './ui/profile.js';
import { openStatsModal, closeStatsModal } from './ui/statsModal.js';
import {
  closeDetailPanel,
  selectTour,
  openEdit,
  closeEdit,
  submitEdit,
  downloadSelectedGpx,
} from './ui/tourPanel.js';
import { deleteSelectedTour, deleteSelectedTours } from './ui/tourRemoval.js';
import { openUpload, closeUpload, submitUpload, selectFile } from './ui/uploadModal.js';
import { uploadImages } from './ui/imageUpload.js';
import {
  closeLightbox,
  showPreviousPhoto,
  showNextPhoto,
  retryLightboxImage,
} from './ui/lightbox.js';
import { renderGallery } from './ui/gallery.js';
import { renderSidebar, loadTours } from './ui/sidebar.js';
import { enterSelectMode, exitSelectMode } from './ui/selectMode.js';
import {
  whenAnnounced,
  TOURS_CHANGED,
  PHOTO_LOCATIONS_CHANGED,
  GALLERY_CHANGED,
} from './ui/events.js';
import { renderAllRoutes, renderSelectedToursRoutes } from './ui/routes.js';
import { renderPins } from './ui/pins.js';
import { debounce } from './lib/debounce.js';
import { mapExpandTransition } from './lib/layout.js';
import {
  populateSortSelect,
  setupLanguageSwitcher,
  setupSortMenu,
  setupLineStyleMenu,
} from './ui/menus.js';
import {
  openModal,
  closeModal,
  trapFocus,
  wireModalClose,
  currentOpenModal,
  wireDropzone,
} from './ui/modal.js';
import { cancelConfirm } from './ui/confirm.js';
import { toast } from './ui/toast.js';
import { readInitialUrl, initHistory, syncUrl, pushLayer } from './ui/router.js';

const t = i18n.t;

const DEBOUNCE_MS = 200;

function subscribeRenderers() {
  whenAnnounced(TOURS_CHANGED, renderSidebar);
  whenAnnounced(PHOTO_LOCATIONS_CHANGED, renderPins);
  whenAnnounced(GALLERY_CHANGED, () => {
    const tour = state.tours.find((candidate) => candidate.id === state.selectedTourId);
    if (tour) renderGallery(tour);
  });
}

// Before anything renders, so the sort/search/in-view controls reflect the
// URL rather than their HTML defaults on a reload or a shared link (#443).
function restoreControlsFromUrl() {
  readInitialUrl();
  populateSortSelect();
  dom.tourSearchInput.value = state.search;
  dom.setVisible(dom.tourSearchClearButton, state.search.length > 0);
  dom.tourSortSelect.value = state.sort;
  // The browser restores checkboxes on reload while JS state starts fresh, so
  // both are written from state rather than trusted.
  dom.inViewCheckbox.checked = state.filterInView;
  dom.pinToggleCheckbox.checked = state.showPins;
  initHistory();
}

function wireMapEvents() {
  // Debounced: 'moveend' can fire several times in quick succession (inertial
  // panning, a pinch-zoom followed by a pan), and each renderSidebar() rescans
  // every tour's points plus rebuilds the list DOM.
  const renderInViewList = debounce(() => {
    if (state.filterInView) renderSidebar();
  }, DEBOUNCE_MS);
  // 'moveend' covers pan and zoom both, so the in-view list needs no second
  // listener.
  map.on('moveend', renderInViewList);
  map.on('zoomend', renderPins);
}

function wireAccount() {
  dom.signInButton.addEventListener('click', signIn);
  dom.sidebarSignInButton.addEventListener('click', signIn);
  dom.signOutButton.addEventListener('click', signOut);
  dom.profileButton.addEventListener('click', openProfile);
  dom.profileNameForm.addEventListener('submit', saveProfileName);
  dom.exportDataButton.addEventListener('click', downloadMyData);
  dom.deleteAccountButton.addEventListener('click', openDeleteAccountModal);
  dom.deleteAccountInput.addEventListener('input', updateDeleteAccountConfirmState);
  dom.deleteAccountConfirmButton.addEventListener('click', deleteMyAccount);
}

function wireStats() {
  dom.statsButton.addEventListener('click', openStatsModal);
  dom.statsHeaderButton.addEventListener('click', openStatsModal);
  dom.statsLongestButton.addEventListener('click', () => {
    const tourId = dom.statsLongestButton.dataset.tourId;
    if (!tourId) return;
    closeStatsModal();
    selectTour(tourId);
  });
}

function wireTourActions() {
  dom.closeDetailButton.addEventListener('click', closeDetailPanel);
  dom.deleteTourButton.addEventListener('click', deleteSelectedTour);
  dom.editTourButton.addEventListener('click', openEdit);
  dom.downloadGpxButton.addEventListener('click', downloadSelectedGpx);
  dom.uploadButton.addEventListener('click', openUpload);
  dom.sidebarUploadButton.addEventListener('click', openUpload);
  dom.editForm.addEventListener('submit', submitEdit);
  dom.uploadForm.addEventListener('submit', submitUpload);
  dom.showAllButton.addEventListener('click', async () => {
    closeDetailPanel();
    await renderAllRoutes();
  });
  dom.retryToursButton.addEventListener('click', loadTours);
  dom.retryMapButton.addEventListener('click', loadTours);
  dom.selectModeButton.addEventListener('click', enterSelectMode);
  dom.cancelSelectButton.addEventListener('click', exitSelectMode);
  dom.deleteSelectedButton.addEventListener('click', deleteSelectedTours);
}

// Any change to what the list shows starts again from its first page.
function applyListFilter(patch) {
  Object.assign(state, patch, { page: 1 });
  renderSidebar();
  syncUrl();
}

function wireListControls() {
  // Fuzzy-scoring every tour and rebuilding the list DOM on every keystroke is
  // wasted work while the user is still typing, so only that part is debounced
  // — the input's own value and the clear button stay in sync immediately.
  const renderSearchResults = debounce(() => {
    renderSidebar();
    syncUrl();
  }, DEBOUNCE_MS);
  dom.tourSearchInput.addEventListener('input', () => {
    Object.assign(state, { search: dom.tourSearchInput.value, page: 1 });
    dom.setVisible(dom.tourSearchClearButton, state.search.length > 0);
    renderSearchResults();
  });
  dom.tourSearchClearButton.addEventListener('click', () => {
    dom.tourSearchInput.value = '';
    dom.hideElement(dom.tourSearchClearButton);
    applyListFilter({ search: '' });
    dom.tourSearchInput.focus();
  });
  dom.tourSortSelect.addEventListener('change', () =>
    applyListFilter({ sort: dom.tourSortSelect.value }),
  );
  dom.inViewCheckbox.addEventListener('change', () =>
    applyListFilter({ filterInView: dom.inViewCheckbox.checked }),
  );
  dom.tourPagerPreviousButton.addEventListener('click', () => {
    state.page -= 1;
    renderSidebar();
  });
  dom.tourPagerNextButton.addEventListener('click', () => {
    state.page += 1;
    renderSidebar();
  });
  dom.pinToggleCheckbox.addEventListener('change', () => {
    state.showPins = dom.pinToggleCheckbox.checked;
    renderPins();
  });
}

// Expand the map by collapsing the side panels. On mobile the map may
// currently be the detail panel's preview (see moveMapIntoDetailPanel) —
// expanding it has to pull it back into .app-layout first, since
// .map-expanded hides .detail-panel entirely, and collapsing again has to
// put it back once done.
function wireMapExpand() {
  let expandedFromDetail = false;
  dom.mapExpandButton.addEventListener('click', () => {
    const wasInDetail = dom.mapContainer.classList.contains('in-detail');
    if (wasInDetail) restoreMapToAppLayout();
    const expanded = dom.appLayout.classList.toggle('map-expanded');
    dom.mapExpandButton.setAttribute('aria-pressed', String(expanded));
    dom.mapExpandButton.title = expanded ? t('map.restoreTitle') : t('map.expandTitle');
    const transition = mapExpandTransition({ expanded, wasInDetail, expandedFromDetail });
    expandedFromDetail = transition.expandedFromDetail;
    if (transition.returnToDetail) moveMapIntoDetailPanel();
    dom.setVisible(dom.mobileMapButton, transition.showFab);
    refreshMapSize();
  });

  // Mobile-only entry point to the same fullscreen map, from the list screen
  // where .map-container is hidden and its own expand button isn't reachable.
  const closeMobileMap = () => {
    if (dom.appLayout.classList.contains('map-expanded')) dom.mapExpandButton.click();
  };
  dom.mobileMapButton.addEventListener('click', () => {
    pushLayer(closeMobileMap);
    dom.mapExpandButton.click();
    // .map-container is display:none on mobile until now, so the fitBounds()
    // that ran at load time (or the last selection change) sized against a
    // hidden 0-size container — invalidateSize() alone won't refit, only
    // re-center, so the zoom needs recomputing now that it's actually visible.
    renderSelectedToursRoutes();
  });
}

function wireModals() {
  dom.helpButton.addEventListener('click', () => openModal(dom.helpModal));
  dom.brandReloadButton.addEventListener('click', () => window.location.reload());
  wireModalClose({
    modal: dom.helpModal,
    closeButton: dom.closeHelpButton,
    onClose: () => closeModal(dom.helpModal),
  });
  wireModalClose({
    modal: dom.profileModal,
    closeButton: dom.closeProfileButton,
    onClose: closeProfile,
  });
  wireModalClose({ modal: dom.editModal, closeButton: dom.closeEditButton, onClose: closeEdit });
  wireModalClose({
    modal: dom.uploadModal,
    closeButton: dom.closeUploadButton,
    onClose: closeUpload,
  });
  wireModalClose({
    modal: dom.statsModal,
    closeButton: dom.closeStatsButton,
    onClose: closeStatsModal,
  });
  wireModalClose({
    modal: dom.deleteAccountModal,
    closeButton: dom.closeDeleteAccountButton,
    onClose: closeDeleteAccountModal,
  });
  wireModalClose({
    modal: dom.lightboxModal,
    closeButton: dom.closeLightboxButton,
    onClose: closeLightbox,
  });
  wireDropzone({ zone: dom.imageDropzone, input: dom.imageFileInput, onFiles: uploadImages });
  wireDropzone({
    zone: dom.gpxDropzone,
    input: dom.gpxFileInput,
    onFiles: ([file]) => selectFile(file),
  });
  dom.lightboxPreviousButton.addEventListener('click', showPreviousPhoto);
  dom.lightboxNextButton.addEventListener('click', showNextPhoto);
  dom.lightboxRetryButton.addEventListener('click', retryLightboxImage);
}

function handleEscape(openModalElement) {
  if (openModalElement === dom.lightboxModal) return closeLightbox();
  if (openModalElement === dom.confirmModal) return cancelConfirm();
  return closeModal(openModalElement);
}

function handleModalKey(event) {
  const openModalElement = currentOpenModal();
  if (!openModalElement) return;
  if (event.key === 'Escape') return handleEscape(openModalElement);
  if (openModalElement === dom.lightboxModal && event.key === 'ArrowLeft')
    return showPreviousPhoto();
  if (openModalElement === dom.lightboxModal && event.key === 'ArrowRight') return showNextPhoto();
  return trapFocus(event, openModalElement);
}

subscribeRenderers();
restoreControlsFromUrl();
wireMapEvents();
wireAccount();
wireStats();
wireTourActions();
wireListControls();
wireMapExpand();
wireModals();
document.addEventListener('keydown', handleModalKey);

// A failure nothing else caught (a floating promise in an event handler) still
// reaches the user instead of only the console.
function reportUnexpectedError(error) {
  console.error(error);
  toast(t('toast.unexpectedError'), { type: 'error' });
}
window.addEventListener('unhandledrejection', (event) => reportUnexpectedError(event.reason));

async function start() {
  try {
    await i18n.init(); // detect locale, load messages, translate the static markup
  } finally {
    // i18n.init() reveals the page once translated; a failure there must not
    // leave the skeleton covering it forever.
    document.body.classList.remove('i18n-loading');
  }
  setupLanguageSwitcher();
  setupSortMenu();
  setupLineStyleMenu();
  await initAuth();
}

start().catch(reportUnexpectedError);

// Offline support is a progressive enhancement: the app works without it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn(error));
  });
}
