'use strict';

import * as i18n from './lib/i18n.js';
import { state } from './ui/state.js';
import { map, refreshMapSize } from './ui/map.js';
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
  elAppLayout,
  elBtnHelp,
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
import { renderAllRoutes } from './ui/routes.js';
import { renderPins } from './ui/pins.js';
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
import { readInitialUrl, initHistory, syncUrl } from './ui/router.js';

const t = i18n.t;

// Before anything renders, so the sort/search/in-view controls reflect the
// URL rather than their HTML defaults on a reload or a shared link (#443).
readInitialUrl();
elTourSearch.value = state.search;
show(elTourSearchClear, state.search.length > 0);
elTourSort.value = state.sort;
initHistory();

// 'moveend' covers pan and zoom both, so the in-view list needs no second
// listener.
map.on('moveend', () => {
  if (state.filterInView) renderSidebar();
});
map.on('zoomend', renderPins);

elBtnLogin.addEventListener('click', signIn);
elBtnLoginSidebar.addEventListener('click', signIn);
elBtnLogout.addEventListener('click', signOut);
elBtnProfile.addEventListener('click', openProfile);
elProfileNameForm.addEventListener('submit', saveProfileName);
elBtnExportData.addEventListener('click', downloadMyData);
elBtnStats.addEventListener('click', openStatsModal);
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

elTourSearch.addEventListener('input', () => {
  state.search = elTourSearch.value;
  state.page = 1;
  show(elTourSearchClear, state.search.length > 0);
  renderSidebar();
  syncUrl();
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

// Expand the map by collapsing the side panels.
elBtnMapExpand.addEventListener('click', () => {
  const expanded = elAppLayout.classList.toggle('map-expanded');
  elBtnMapExpand.setAttribute('aria-pressed', String(expanded));
  elBtnMapExpand.title = expanded ? t('map.restoreTitle') : t('map.expandTitle');
  refreshMapSize();
});

elBtnHelp.addEventListener('click', () => openModal(elHelpModal));
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
