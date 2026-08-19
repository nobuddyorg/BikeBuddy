import { expect, Locator, Page } from '@playwright/test';
import { initUploadModal } from './upload-modal';

// Locator.setInputFiles' own type: one value, or a homogeneous array — never a
// mixed array.
type FileInputArg = Parameters<Locator['setInputFiles']>[0];

interface MainPage {
  /** Points to self (the app shell). */
  (): Locator;
  /** High-level interactions. */
  do: {
    openUpload(): Promise<void>;
    openProfile(): Promise<void>;
    openHelp(): Promise<void>;
    openEdit(): Promise<void>;
    downloadGpx(): Promise<void>;
    logout(): Promise<void>;
    toggleSidebar(): Promise<void>;
    search(query: string): Promise<void>;
    sortBy(option: string): Promise<void>;
    filterInView(on: boolean): Promise<void>;
    selectTour(name: string): Promise<void>;
    tapTour(name: string): Promise<void>;
    longPressTour(name: string): Promise<void>;
    swipeTour(name: string, dx: number): Promise<void>;
    closeDetail(): Promise<void>;
    showAllTours(): Promise<void>;
    uploadGpx(opts: { name: string; gpx: string; filename?: string }): Promise<void>;
    addImage(files: FileInputArg): Promise<void>;
    dismissImageError(): Promise<void>;
    retryImage(): Promise<void>;
    deleteImage(index?: number): Promise<void>;
    openLightbox(index?: number): Promise<void>;
    closeLightbox(): Promise<void>;
    deleteTour(): Promise<void>;
    enterSelectMode(): Promise<void>;
    toggleTourSelection(name: string): Promise<void>;
    deleteSelected(): Promise<void>;
    cancelSelect(): Promise<void>;
    showPins(visible: boolean): Promise<void>;
    pagerPrev(): Promise<void>;
    pagerNext(): Promise<void>;
    zoomOut(times: number): Promise<void>;
    zoomIn(times: number): Promise<void>;
    tourNames(): Promise<string[]>;
  };
  /** Raw locators. */
  locators: {
    map: Locator;
    mapEmpty: Locator;
    mapLoadError: Locator;
    userMenu: Locator;
    authPrompt: Locator;
    sidebar: Locator;
    buttons: {
      login: Locator;
      logout: Locator;
      upload: Locator;
      profile: Locator;
      help: Locator;
      mapExpand: Locator;
      editTour: Locator;
      downloadGpx: Locator;
      deleteTour: Locator;
      closeDetail: Locator;
      showAll: Locator;
      selectMode: Locator;
      deleteSelected: Locator;
      cancelSelect: Locator;
    };
    list: {
      container: Locator;
      names: Locator;
      active: Locator;
      count: Locator;
      empty: Locator;
      loadError: Locator;
      retryButton: Locator;
    };
    selection: {
      bar: Locator;
      count: Locator;
    };
    search: Locator;
    sort: Locator;
    filterInView: {
      toggle: Locator;
      toggleInput: Locator;
    };
    detail: {
      panel: Locator;
      name: Locator;
      description: Locator;
      date: Locator;
    };
    image: {
      input: Locator;
      thumbs: Locator;
      pendingTiles: Locator;
      errorTiles: Locator;
      retryButtons: Locator;
      dismissButtons: Locator;
      deleteButtons: Locator;
    };
    lightbox: {
      root: Locator;
      img: Locator;
    };
    pins: {
      toggle: Locator;
      toggleInput: Locator;
      markers: Locator;
    };
    pager: {
      container: Locator;
      label: Locator;
      prev: Locator;
      next: Locator;
    };
    mapControls: {
      zoomOut: Locator;
      zoomIn: Locator;
    };
  };
}

export function initMainPage(page: Page): MainPage {
  const root = page.locator('body');
  const locators = {
    map: page.locator('#map'),
    mapEmpty: page.locator('#map-empty'),
    mapLoadError: page.locator('#map-load-error'),
    userMenu: page.locator('#user-menu'),
    authPrompt: page.locator('#auth-prompt'),
    sidebar: page.locator('.sidebar'),
    buttons: {
      login: page.locator('#btn-login'),
      logout: page.locator('#btn-logout'),
      upload: page.locator('#btn-upload'),
      profile: page.locator('#btn-profile'),
      help: page.locator('#btn-help'),
      mapExpand: page.locator('#btn-map-expand'),
      editTour: page.locator('#btn-edit-tour'),
      downloadGpx: page.locator('#btn-download-gpx'),
      deleteTour: page.locator('#btn-delete-tour'),
      closeDetail: page.locator('#btn-close-detail'),
      showAll: page.locator('#btn-show-all'),
      selectMode: page.locator('#btn-select-mode'),
      deleteSelected: page.locator('#btn-delete-selected'),
      cancelSelect: page.locator('#btn-cancel-select'),
    },
    list: {
      container: page.locator('#tour-list'),
      names: page.locator('#tour-list .tour-item-name'),
      active: page.locator('#tour-list .tour-item.active'),
      count: page.locator('#tour-count'),
      empty: page.locator('#no-tours'),
      loadError: page.locator('#tour-load-error'),
      retryButton: page.locator('#btn-retry-tours'),
    },
    selection: {
      bar: page.locator('#selection-bar'),
      count: page.locator('#selection-count'),
    },
    search: page.locator('#tour-search'),
    sort: page.locator('#tour-sort'),
    filterInView: {
      toggle: page.locator('#filter-in-view-toggle'),
      toggleInput: page.locator('#filter-in-view-input'),
    },
    detail: {
      panel: page.locator('#detail-panel'),
      name: page.locator('#detail-name'),
      description: page.locator('#detail-description'),
      date: page.locator('#detail-date'),
    },
    image: {
      input: page.locator('#image-file'),
      thumbs: page.locator('#tour-image-grid .image-thumb'),
      pendingTiles: page.locator('[data-testid="image-tile-pending"]'),
      errorTiles: page.locator('[data-testid="image-tile-error"]'),
      retryButtons: page.locator('[data-testid="image-tile-retry"]'),
      dismissButtons: page.locator('[data-testid="image-tile-dismiss"]'),
      deleteButtons: page.locator('#tour-image-grid .image-delete'),
    },
    lightbox: {
      root: page.locator('#lightbox'),
      img: page.locator('#lightbox-img'),
    },
    pins: {
      toggle: page.locator('#pin-toggle'),
      toggleInput: page.locator('#pin-toggle-input'),
      markers: page.locator('.photo-pin'),
    },
    pager: {
      container: page.locator('#tour-pager'),
      label: page.locator('#tour-pager-label'),
      prev: page.locator('#tour-pager-prev'),
      next: page.locator('#tour-pager-next'),
    },
    mapControls: {
      zoomOut: page.locator('.leaflet-control-zoom-out'),
      zoomIn: page.locator('.leaflet-control-zoom-in'),
    },
  };

  const interactions = {
    openUpload: async () => locators.buttons.upload.click(),
    openProfile: async () => locators.buttons.profile.click(),
    openHelp: async () => locators.buttons.help.click(),
    openEdit: async () => locators.buttons.editTour.click(),
    downloadGpx: async () => locators.buttons.downloadGpx.click(),
    // Sign Out lives inside the profile modal.
    logout: async () => {
      await locators.buttons.profile.click();
      await locators.buttons.logout.click();
    },
    toggleSidebar: async () => locators.buttons.mapExpand.click(),
    search: async (query: string) => locators.search.fill(query),
    sortBy: async (option: string) => {
      await locators.sort.selectOption(option);
    },
    filterInView: async (on: boolean) => {
      if (on) await locators.filterInView.toggleInput.check();
      else await locators.filterInView.toggleInput.uncheck();
    },
    selectTour: async (name: string) => {
      await locators.list.container.locator('.tour-item', { hasText: name }).click();
    },
    // CDP touch dispatch, not Playwright's mouse API: createTourItem branches on
    // the preceding pointerdown's pointerType, so a click() would take the wrong
    // path.
    tapTour: async (name: string) => {
      const row = locators.list.container.locator('.tour-item', { hasText: name });
      const box = await row.boundingBox();
      if (!box) throw new Error(`tour row "${name}" not found`);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      // Chromium's synthesized compatibility click arrives asynchronously, and
      // CI's Linux Chromium needs more margin than local macOS: at swipeTour's
      // 300ms, a tap right after a swipe intermittently missed its row.
      await page.waitForTimeout(500);
    },
    // The bug this covers (#275: a long-press's ghost click undoing its own
    // select-mode entry) is touch-specific. Chromium suppresses the
    // compatibility click outright when a mouse press removes the element
    // mid-gesture, so a mouse simulation passes even against broken code.
    longPressTour: async (name: string) => {
      const row = locators.list.container.locator('.tour-item', { hasText: name });
      const box = await row.boundingBox();
      if (!box) throw new Error(`tour row "${name}" not found`);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      // The ghost click can arrive after touchEnd resolves, and web-first
      // assertions pass on the first successful poll rather than once the state
      // settles — so without this wait a test could pass before the ghost click
      // even had its chance to fire. 500ms clears the app's 400ms window.
      await page.waitForTimeout(500);
    },
    // Positive dx swipes right (delete, #289), negative left (detail, #308).
    // The intermediate touchMove events mirror how a finger delivers a drag;
    // bindTourSwipe reads real touch pointerType, so a mouse drag won't do.
    swipeTour: async (name: string, dx: number) => {
      const row = locators.list.container.locator('.tour-item', { hasText: name });
      const box = await row.boundingBox();
      if (!box) throw new Error(`tour row "${name}" not found`);
      const startX = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y }],
      });
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: startX + (dx * i) / steps, y }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
    },
    closeDetail: async () => locators.buttons.closeDetail.click(),
    showAllTours: async () => locators.buttons.showAll.click(),
    uploadGpx: async ({
      name,
      gpx,
      filename = 'ride.gpx',
    }: {
      name: string;
      gpx: string;
      filename?: string;
    }) => {
      await locators.buttons.upload.click();
      const upload = initUploadModal(page);
      await upload.do.setName(name);
      await upload.do.pickFile({
        name: filename,
        mimeType: 'application/gpx+xml',
        buffer: Buffer.from(gpx),
      });
      await upload.do.submit();
      await expect(locators.list.container).toContainText(name);
    },
    addImage: async (files: FileInputArg) => {
      await locators.image.input.setInputFiles(files);
    },
    dismissImageError: async () => {
      await locators.image.dismissButtons.first().click();
    },
    retryImage: async () => {
      await locators.image.retryButtons.first().click();
    },
    deleteImage: async (index = 0) => {
      page.once('dialog', (d) => d.accept());
      await locators.image.deleteButtons.nth(index).click();
    },
    openLightbox: async (index = 0) => {
      await locators.image.thumbs.nth(index).click();
    },
    closeLightbox: async () => {
      await locators.lightbox.root.click();
    },
    deleteTour: async () => {
      page.once('dialog', (d) => d.accept());
      await locators.buttons.deleteTour.click();
    },
    enterSelectMode: async () => locators.buttons.selectMode.click(),
    toggleTourSelection: async (name: string) => {
      await locators.list.container.locator('.tour-item', { hasText: name }).click();
    },
    deleteSelected: async () => {
      page.once('dialog', (d) => d.accept());
      await locators.buttons.deleteSelected.click();
    },
    cancelSelect: async () => locators.buttons.cancelSelect.click(),
    showPins: async (visible: boolean) => {
      if (visible) await locators.pins.toggleInput.check();
      else await locators.pins.toggleInput.uncheck();
    },
    pagerPrev: async () => locators.pager.prev.click(),
    pagerNext: async () => locators.pager.next.click(),
    // Leaflet ignores zoom clicks that land mid-animation, hence the wait. At
    // min/max zoom it marks the button aria-disabled, and Playwright's click()
    // then blocks waiting for it rather than no-op'ing — so stop early.
    zoomOut: async (times: number) => {
      for (let i = 0; i < times; i++) {
        if ((await locators.mapControls.zoomOut.getAttribute('aria-disabled')) === 'true') break;
        await locators.mapControls.zoomOut.click();
        await page.waitForTimeout(300);
      }
    },
    zoomIn: async (times: number) => {
      for (let i = 0; i < times; i++) {
        if ((await locators.mapControls.zoomIn.getAttribute('aria-disabled')) === 'true') break;
        await locators.mapControls.zoomIn.click();
        await page.waitForTimeout(300);
      }
    },
    tourNames: async () => locators.list.names.allTextContents(),
  };

  return Object.assign(() => root, { locators, do: interactions });
}
