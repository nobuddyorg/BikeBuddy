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
} from './ui/dom.js';
import { signIn, signOut, initAuth } from './ui/auth.js';
import {
  openProfile,
  saveProfileName,
  downloadMyData,
  deleteMyAccount,
  closeProfile,
} from './ui/profile.js';
import {
  closeDetailPanel,
  deselectTour,
  deleteSelectedTour,
  deleteSelectedTours,
  openEdit,
  closeEdit,
  submitEdit,
  downloadSelectedGpx,
} from './ui/tour-detail.js';
import { openUpload, closeUpload, submitUpload, selectFile } from './ui/upload-modal.js';
import { uploadImages, closeLightbox } from './ui/images.js';
import { renderSidebar, enterSelectMode, exitSelectMode } from './ui/sidebar.js';
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

const t = i18n.t;

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
