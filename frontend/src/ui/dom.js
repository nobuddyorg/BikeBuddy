const byId = (id) => document.getElementById(id);

export const showElement = (element) => element.classList.remove('hidden');
export const hideElement = (element) => element.classList.add('hidden');
export const setVisible = (element, isVisible) => element.classList.toggle('hidden', !isVisible);
export const isHidden = (element) => element.classList.contains('hidden');

export const appLayout = byId('app-layout');
export const sidebar = byId('sidebar');
export const toastContainer = byId('toasts');

// Navbar
export const brandReloadButton = byId('btn-brand-reload');
export const helpButton = byId('btn-help');
export const uploadButton = byId('btn-upload');
export const signInButton = byId('btn-login');
export const userMenu = byId('user-menu');
export const profileButton = byId('btn-profile');

// Sidebar
export const statsHeaderButton = byId('btn-stats-header');
export const tourCountBadge = byId('tour-count');
export const selectModeButton = byId('btn-select-mode');
export const authPrompt = byId('auth-prompt');
export const sidebarSignInButton = byId('btn-login-sidebar');
export const tourLoading = byId('tour-loading');
export const tourControls = byId('tour-controls');
export const tourSearchInput = byId('tour-search');
export const tourSearchClearButton = byId('tour-search-clear');
export const tourSortSelect = byId('tour-sort');
export const sortMenu = byId('sort-menu');
export const sortMenuButton = byId('btn-sort-menu');
export const sortMenuList = byId('sort-menu-list');
export const statsButton = byId('btn-stats');
export const selectionBar = byId('selection-bar');
export const selectionCount = byId('selection-count');
export const deleteSelectedButton = byId('btn-delete-selected');
export const cancelSelectButton = byId('btn-cancel-select');
export const tourList = byId('tour-list');
export const tourPager = byId('tour-pager');
export const tourPagerPreviousButton = byId('tour-pager-prev');
export const tourPagerLabel = byId('tour-pager-label');
export const tourPagerNextButton = byId('tour-pager-next');
export const showAllButton = byId('btn-show-all');
export const noToursState = byId('no-tours');
export const sidebarUploadButton = byId('btn-upload-sidebar');
export const tourLoadError = byId('tour-load-error');
export const retryToursButton = byId('btn-retry-tours');

// Map
export const mapContainer = byId('map-container');
export const inViewToggle = byId('filter-in-view-toggle');
export const inViewCheckbox = byId('filter-in-view-input');
export const pinToggle = byId('pin-toggle');
export const pinToggleCheckbox = byId('pin-toggle-input');
export const lineStyleControl = byId('line-style-wrap');
export const lineStyleButton = byId('btn-line-style');
export const lineStyleMenu = byId('line-style-menu');
export const lineStyleColorInput = byId('line-style-color');
export const lineStyleWidthInput = byId('line-style-width');
export const lineStyleWidthValue = byId('line-style-width-value');
export const lineStyleOpacityInput = byId('line-style-opacity');
export const lineStyleOpacityValue = byId('line-style-opacity-value');
export const mapExpandButton = byId('btn-map-expand');
export const mapEmptyOverlay = byId('map-empty');
export const mapLoadErrorOverlay = byId('map-load-error');
export const retryMapButton = byId('btn-retry-map');
export const mapLoadingOverlay = byId('map-loading');
export const mobileMapButton = byId('btn-mobile-map-fab');

// Tour detail panel
export const detailPanel = byId('detail-panel');
export const closeDetailButton = byId('btn-close-detail');
export const detailName = byId('detail-name');
export const detailDate = byId('detail-date');
export const detailDistance = byId('detail-distance');
export const detailElevationGain = byId('detail-elevation-gain');
export const detailDuration = byId('detail-duration');
export const detailAverageSpeed = byId('detail-avg-speed');
export const detailDescription = byId('detail-description');
export const imageGrid = byId('tour-image-grid');
export const imageDropzone = byId('image-dropzone');
export const imageFileInput = byId('image-file');
export const imageError = byId('image-error');
export const editTourButton = byId('btn-edit-tour');
export const downloadGpxButton = byId('btn-download-gpx');
export const deleteTourButton = byId('btn-delete-tour');

// Help modal
export const helpModal = byId('help-modal');
export const closeHelpButton = byId('btn-close-help');

// Profile modal
export const profileModal = byId('profile-modal');
export const closeProfileButton = byId('btn-close-profile');
export const profileAvatar = byId('profile-avatar');
export const profileTitle = byId('profile-modal-title');
export const profileEmail = byId('profile-email');
export const profileMemberSince = byId('profile-since');
export const languageSwitcher = byId('lang-switcher');
export const languageButton = byId('btn-lang');
export const languageMenu = byId('lang-menu');
export const languageSearchInput = byId('lang-search');
export const languageList = byId('lang-list');
export const profileNameForm = byId('profile-name-form');
export const profileNameInput = byId('profile-name-input');
export const profileNameError = byId('profile-name-error');
export const signOutButton = byId('btn-logout');
export const exportDataButton = byId('btn-export-data');
export const deleteAccountButton = byId('btn-delete-account');

// Upload modal
export const uploadModal = byId('upload-modal');
export const closeUploadButton = byId('btn-close-upload');
export const uploadForm = byId('upload-form');
export const uploadNameInput = byId('upload-name');
export const uploadDescriptionInput = byId('upload-description');
export const gpxDropzone = byId('dropzone');
export const gpxFileInput = byId('upload-file');
export const gpxDropzoneFilename = byId('dropzone-filename');
export const uploadProgress = byId('upload-progress');
export const uploadProgressBar = byId('upload-progress-bar');
export const uploadError = byId('upload-error');
export const submitUploadButton = byId('btn-submit-upload');

// Lightbox
export const lightboxModal = byId('lightbox');
export const lightboxDeleteButton = byId('btn-lightbox-delete');
export const closeLightboxButton = byId('btn-close-lightbox');
export const lightboxStage = byId('lightbox-stage');
export const lightboxImage = byId('lightbox-img');
export const lightboxError = byId('lightbox-error');
export const lightboxRetryButton = byId('btn-lightbox-retry');
export const lightboxNavbar = byId('lightbox-navbar');
export const lightboxPreviousButton = byId('btn-lightbox-prev');
export const lightboxCounter = byId('lightbox-counter');
export const lightboxNextButton = byId('btn-lightbox-next');

// Edit modal
export const editModal = byId('edit-modal');
export const closeEditButton = byId('btn-close-edit');
export const editForm = byId('edit-form');
export const editNameInput = byId('edit-name');
export const editDateInput = byId('edit-date');
export const editDescriptionInput = byId('edit-description');
export const editError = byId('edit-error');

// Confirm modal
export const confirmModal = byId('confirm-modal');
export const confirmCloseButton = byId('btn-close-confirm');
export const confirmTitle = byId('confirm-modal-title');
export const confirmMessage = byId('confirm-modal-message');
export const confirmCancelButton = byId('btn-confirm-cancel');
export const confirmOkButton = byId('btn-confirm-ok');

// Delete-account modal
export const deleteAccountModal = byId('delete-account-modal');
export const closeDeleteAccountButton = byId('btn-close-delete-account');
export const deleteAccountHint = byId('delete-account-hint');
export const deleteAccountInput = byId('delete-account-input');
export const deleteAccountConfirmButton = byId('btn-delete-account-confirm');

// Stats modal
export const statsModal = byId('stats-modal');
export const closeStatsButton = byId('btn-close-stats');
export const statsTotalDistance = byId('stats-total-distance');
export const statsTotalCount = byId('stats-total-count');
export const statsThisYear = byId('stats-this-year');
export const statsLastYear = byId('stats-last-year');
export const statsAverage = byId('stats-average');
export const statsLongestButton = byId('btn-stats-longest');
export const statsLongestDetail = byId('stats-longest-detail');
export const statsEmpty = byId('stats-empty');
export const statsPerYear = byId('stats-per-year');
