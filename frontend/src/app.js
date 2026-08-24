'use strict';

import * as i18n from './lib/i18n.js';
import { state } from './ui/state.js';
import { map, refreshMapSize, moveMapIntoDetailPanel, restoreMapToAppLayout } from './ui/map.js';
import {
  $,
  elBtnLogin,
  elBtnLoginSidebar,
  elBtnLogout,
  elBtnProfile,
  elProfileNameForm,
  elBtnExportData,
  elBtnDeleteAccount,
  elBtnCloseDetail,
  elBtnDeleteTour,
  elBtnEditTour,
  elBtnDownloadGpx,
  elBtnUpload,
  elBtnUploadSidebar,
  elEditForm,
  elUploadForm,
  elTourSearch,
  elTourSearchClear,
  elTourSort,
  elFilterInViewInput,
  elTourPagerPrev,
  elTourPagerNext,
  elBtnShowAll,
  elBtnSelectMode,
  elBtnCancelSelect,
  elBtnDeleteSelected,
  elPinToggleInput,
  elBtnMapExpand,
  elBtnMobileMapFab,
  elMapContainer,
  elAppLayout,
  elBtnHelp,
  elBtnBrandReload,
  elHelpModal,
  elProfileModal,
  elEditModal,
  elUploadModal,
  elImageDropzone,
  elImageFile,
  elDropzone,
  elUploadFile,
  elLightbox,
  elConfirmModal,
  elDeleteAccountModal,
  elDeleteAccountInput,
  elBtnDeleteAccountConfirm,
  elBtnStatsLongest,
  elStatsModal,
  elBtnStats,
  elBtnStatsHeader,
  show,
} from './ui/dom.js';
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
  deselectTour,
  selectTour,
  deleteSelectedTour,
  deleteSelectedTours,
  openEdit,
  closeEdit,
  submitEdit,
  downloadSelectedGpx,
} from './ui/tour-detail.js';
import { openUpload, closeUpload, submitUpload, selectFile } from './ui/upload-modal.js';
import {
  uploadImages,
  closeLightbox,
  lightboxPrev,
  lightboxNext,
  retryLightboxImage,
} from './ui/images.js';
import { renderSidebar, loadTours, enterSelectMode, exitSelectMode } from './ui/sidebar.js';
import { renderAllRoutes, renderSelectedToursRoutes } from './ui/routes.js';
import { renderPins } from './ui/pins.js';
import { debounce } from './lib/debounce.js';
import { setupLanguageSwitcher, setupSortMenu, setupLineStyleMenu } from './ui/menus.js';
import {
  openModal,
  closeModal,
  trapFocus,
  wireModalClose,
  openModalEl,
  wireDropzone,
} from './ui/modal.js';
import { cancelConfirm } from './ui/confirm.js';
import { readInitialUrl, initHistory, syncUrl, pushLayer } from './ui/router.js';

const t = i18n.t;

// Before anything renders, so the sort/search/in-view controls reflect the
// URL rather than their HTML defaults on a reload or a shared link (#443).
readInitialUrl();
elTourSearch.value = state.search;
show(elTourSearchClear, state.search.length > 0);
elTourSort.value = state.sort;
initHistory();

// Debounced: 'moveend' can fire several times in quick succession (inertial
// panning, a pinch-zoom followed by a pan), and each renderSidebar() rescans
// every tour's points plus rebuilds the list DOM.
const DEBOUNCE_MS = 200;
const renderInViewList = debounce(() => {
  if (state.filterInView) renderSidebar();
}, DEBOUNCE_MS);

// 'moveend' covers pan and zoom both, so the in-view list needs no second
// listener.
map.on('moveend', renderInViewList);
map.on('zoomend', renderPins);

elBtnLogin.addEventListener('click', signIn);
elBtnLoginSidebar.addEventListener('click', signIn);
elBtnLogout.addEventListener('click', signOut);
elBtnProfile.addEventListener('click', openProfile);
elProfileNameForm.addEventListener('submit', saveProfileName);
elBtnExportData.addEventListener('click', downloadMyData);
elBtnStats.addEventListener('click', openStatsModal);
elBtnStatsHeader.addEventListener('click', openStatsModal);
wireModalClose(elStatsModal, $('btn-close-stats'), closeStatsModal);
elBtnStatsLongest.addEventListener('click', () => {
  const id = elBtnStatsLongest.dataset.tourId;
  if (!id) return;
  closeStatsModal();
  selectTour(id);
});
elBtnDeleteAccount.addEventListener('click', openDeleteAccountModal);
elDeleteAccountInput.addEventListener('input', updateDeleteAccountConfirmState);
elBtnDeleteAccountConfirm.addEventListener('click', deleteMyAccount);
wireModalClose(elDeleteAccountModal, $('btn-close-delete-account'), closeDeleteAccountModal);
elBtnCloseDetail.addEventListener('click', closeDetailPanel);
elBtnDeleteTour.addEventListener('click', deleteSelectedTour);
elBtnEditTour.addEventListener('click', openEdit);
elBtnDownloadGpx.addEventListener('click', downloadSelectedGpx);
elBtnUpload.addEventListener('click', openUpload);
elBtnUploadSidebar.addEventListener('click', openUpload);
elEditForm.addEventListener('submit', submitEdit);
elUploadForm.addEventListener('submit', submitUpload);

// Fuzzy-scoring every tour and rebuilding the list DOM on every keystroke is
// wasted work while the user is still typing, so only that part is debounced
// — the input's own value and the clear button stay in sync immediately.
const renderSearchResults = debounce(() => {
  renderSidebar();
  syncUrl();
}, DEBOUNCE_MS);

elTourSearch.addEventListener('input', () => {
  state.search = elTourSearch.value;
  state.page = 1;
  show(elTourSearchClear, state.search.length > 0);
  renderSearchResults();
});
elTourSearchClear.addEventListener('click', () => {
  elTourSearch.value = '';
  state.search = '';
  state.page = 1;
  show(elTourSearchClear, false);
  renderSidebar();
  syncUrl();
  elTourSearch.focus();
});
elTourSort.addEventListener('change', () => {
  state.sort = elTourSort.value;
  state.page = 1;
  renderSidebar();
  syncUrl();
});
elFilterInViewInput.addEventListener('change', () => {
  state.filterInView = elFilterInViewInput.checked;
  state.page = 1;
  renderSidebar();
  syncUrl();
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
$('btn-retry-tours').addEventListener('click', loadTours);
$('btn-retry-map').addEventListener('click', loadTours);
elBtnSelectMode.addEventListener('click', enterSelectMode);
elBtnCancelSelect.addEventListener('click', exitSelectMode);
elBtnDeleteSelected.addEventListener('click', deleteSelectedTours);
elPinToggleInput.addEventListener('change', () => {
  state.showPins = elPinToggleInput.checked;
  renderPins();
});

// The browser restores the checkbox on reload while JS state resets to false,
// so without this the pins need an off/on toggle to reappear.
elPinToggleInput.checked = state.showPins;

// Expand the map by collapsing the side panels. On mobile the map may
// currently be the detail panel's preview (see moveMapIntoDetailPanel) —
// expanding it has to pull it back into .app-layout first, since
// .map-expanded hides .detail-panel entirely, and collapsing again has to
// put it back once done.
let mapExpandedFromDetail = false;
elBtnMapExpand.addEventListener('click', () => {
  const wasInDetail = elMapContainer.classList.contains('in-detail');
  if (wasInDetail) restoreMapToAppLayout();
  const expanded = elAppLayout.classList.toggle('map-expanded');
  elBtnMapExpand.setAttribute('aria-pressed', String(expanded));
  elBtnMapExpand.title = expanded ? t('map.restoreTitle') : t('map.expandTitle');
  if (expanded) {
    mapExpandedFromDetail = wasInDetail;
    show(elBtnMobileMapFab, false);
  } else if (mapExpandedFromDetail) {
    moveMapIntoDetailPanel();
    mapExpandedFromDetail = false;
  } else {
    show(elBtnMobileMapFab, true);
  }
  refreshMapSize();
});

// Mobile-only entry point to the same fullscreen map, from the list screen
// where .map-container is hidden and its own expand button isn't reachable.
function closeMobileMap() {
  if (elAppLayout.classList.contains('map-expanded')) elBtnMapExpand.click();
}
elBtnMobileMapFab.addEventListener('click', () => {
  pushLayer(closeMobileMap);
  elBtnMapExpand.click();
  // .map-container is display:none on mobile until now, so the fitBounds()
  // that ran at load time (or the last selection change) sized against a
  // hidden 0-size container — invalidateSize() alone won't refit, only
  // re-center, so the zoom needs recomputing now that it's actually visible.
  renderSelectedToursRoutes();
});

elBtnHelp.addEventListener('click', () => openModal(elHelpModal));
elBtnBrandReload.addEventListener('click', () => window.location.reload());
wireModalClose(elHelpModal, $('btn-close-help'), () => closeModal(elHelpModal));
wireModalClose(elProfileModal, $('btn-close-profile'), closeProfile);
wireModalClose(elEditModal, $('btn-close-edit'), closeEdit);
wireModalClose(elUploadModal, $('btn-close-upload'), closeUpload);

wireDropzone(elImageDropzone, elImageFile, uploadImages);
wireDropzone(elDropzone, elUploadFile, ([file]) => selectFile(file));

wireModalClose(elLightbox, $('btn-close-lightbox'), closeLightbox);
$('btn-lightbox-prev').addEventListener('click', lightboxPrev);
$('btn-lightbox-next').addEventListener('click', lightboxNext);
$('btn-lightbox-retry').addEventListener('click', retryLightboxImage);

document.addEventListener('keydown', (e) => {
  const open = openModalEl();
  if (!open) return;
  if (e.key === 'Escape') {
    if (open === elLightbox) return closeLightbox();
    if (open === elConfirmModal) return cancelConfirm();
    return closeModal(open);
  }
  if (open === elLightbox) {
    if (e.key === 'ArrowLeft') return lightboxPrev();
    if (e.key === 'ArrowRight') return lightboxNext();
  }
  trapFocus(e, open);
});

(async () => {
  try {
    await i18n.init(); // detect locale, load messages, translate the static markup
    setupLanguageSwitcher();
    setupSortMenu();
    setupLineStyleMenu();
    initAuth();
  } finally {
    // Belt-and-suspenders: i18n.init() already does this once translation is
    // applied, but a failure anywhere above must not leave the skeleton
    // covering the page forever.
    document.body.classList.remove('i18n-loading');
  }
})();

// Offline support is a progressive enhancement — registration failing (an
// unsupported browser, a blocked extension) shouldn't affect the rest of the app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
