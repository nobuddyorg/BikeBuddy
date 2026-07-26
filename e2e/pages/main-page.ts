import { expect, Locator, Page } from '@playwright/test';
import { initUploadModal } from './upload-modal';

// Mirrors Locator.setInputFiles' own accepted type exactly (a single value,
// or a homogeneous array of one variant — never a mixed array of both).
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
      selectMode: Locator;
      deleteSelected: Locator;
      cancelSelect: Locator;
    };
    list: {
      container: Locator;
      names: Locator;
      count: Locator;
      empty: Locator;
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
      selectMode: page.locator('#btn-select-mode'),
      deleteSelected: page.locator('#btn-delete-selected'),
      cancelSelect: page.locator('#btn-cancel-select'),
    },
    list: {
      container: page.locator('#tour-list'),
      names: page.locator('#tour-list .tour-item-name'),
      count: page.locator('#tour-count'),
      empty: page.locator('#no-tours'),
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
    // Sign Out now lives inside the profile modal — open it first.
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
    // Genuine touch dispatch (CDP), not Playwright's mouse API — createTourItem
    // (app.js) tells a tap from a mouse click by the pointerType of the
    // preceding pointerdown, so a mouse-based click() would never exercise
    // the touch branch this is meant to test (#308).
    tapTour: async (name: string) => {
      const row = locators.list.container.locator('.tour-item', { hasText: name });
      const box = await row.boundingBox();
      if (!box) throw new Error(`tour row "${name}" not found`);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      // 500ms, matching longPressTour's own trailing wait below, not the
      // 300ms swipeTour uses — the compatibility click Chromium synthesizes
      // after a touch tap arrives asynchronously, and CI's Linux Chromium
      // was observed to need more margin here than local macOS runs (#310:
      // a tap right after a swipe intermittently missed its target row on
      // CI at 300ms).
      await page.waitForTimeout(500);
    },
    // Genuine touch dispatch (CDP), not Playwright's mouse API — the actual
    // bug this covers (#275: a long-press's trailing "ghost click" un-doing
    // its own select-mode entry) is touch-specific. A mouse-based
    // press-and-hold never reproduces it: Chromium suppresses the
    // compatibility click outright once the original element is removed
    // mid-gesture, so a mouse simulation would pass even against a broken
    // implementation.
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
      // The trailing ghost click (and the app's suppression of it) is
      // asynchronous and can arrive after touchEnd resolves. Playwright's
      // web-first assertions succeed on the FIRST passing poll, not once the
      // state has settled — without this wait, an assertion could pass
      // before the ghost click has had a chance to wrongly fire, silently
      // failing to exercise the exact race this helper exists to test.
      // 500ms comfortably clears the app's 400ms suppression window.
      await page.waitForTimeout(500);
    },
    // Genuine touch dispatch (CDP), matching longPressTour above — the
    // implementation (bindTourSwipe in app.js) reads real touch
    // pointerType, so a mouse-drag simulation would never exercise it.
    // Positive dx swipes right (delete, #289); negative dx swipes left
    // (opens the detail panel, #308).
    // Multiple intermediate touchMove events (not one big jump) mirror how
    // a real finger delivers a drag.
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
    // Leaflet ignores zoom-control clicks that land mid-animation, so each
    // click waits out the ~250ms zoom transition before the next one. Once
    // the map hits min/max zoom, Leaflet marks the button aria-disabled;
    // Playwright's click() then waits forever for it to become "enabled"
    // rather than no-op'ing, so stop early instead of requesting more clicks
    // than the map can actually take.
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
