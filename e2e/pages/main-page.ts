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
    logout(): Promise<void>;
    toggleSidebar(): Promise<void>;
    search(query: string): Promise<void>;
    sortBy(option: string): Promise<void>;
    selectTour(name: string): Promise<void>;
    uploadGpx(opts: { name: string; gpx: string; filename?: string }): Promise<void>;
    addImage(files: FileInputArg): Promise<void>;
    dismissImageError(): Promise<void>;
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
    switchLanguage(opts: { search: string; pick: string }): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    map: Locator;
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
      deleteTour: Locator;
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
    detail: {
      name: Locator;
      description: Locator;
    };
    image: {
      input: Locator;
      thumbs: Locator;
      pendingTiles: Locator;
      errorTiles: Locator;
      retryButtons: Locator;
      dismissButtons: Locator;
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
    lang: {
      button: Locator;
      menu: Locator;
      search: Locator;
      options: Locator;
    };
  };
}

export function initMainPage(page: Page): MainPage {
  const root = page.locator('body');
  const locators = {
    map: page.locator('#map'),
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
      deleteTour: page.locator('#btn-delete-tour'),
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
    detail: {
      name: page.locator('#detail-name'),
      description: page.locator('#detail-description'),
    },
    image: {
      input: page.locator('#image-file'),
      thumbs: page.locator('#tour-image-grid .image-thumb'),
      pendingTiles: page.locator('[data-testid="image-tile-pending"]'),
      errorTiles: page.locator('[data-testid="image-tile-error"]'),
      retryButtons: page.locator('[data-testid="image-tile-retry"]'),
      dismissButtons: page.locator('[data-testid="image-tile-dismiss"]'),
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
    lang: {
      button: page.locator('#btn-lang'),
      menu: page.locator('#lang-menu'),
      search: page.locator('#lang-search'),
      options: page.locator('.lang-option'),
    },
  };

  const interactions = {
    openUpload: async () => locators.buttons.upload.click(),
    openProfile: async () => locators.buttons.profile.click(),
    openHelp: async () => locators.buttons.help.click(),
    openEdit: async () => locators.buttons.editTour.click(),
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
    selectTour: async (name: string) => {
      await locators.list.container.locator('.tour-item', { hasText: name }).click();
    },
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
    switchLanguage: async ({ search, pick }: { search: string; pick: string }) => {
      await locators.lang.button.click();
      await locators.lang.search.fill(search);
      await locators.lang.options.filter({ hasText: pick }).click();
    },
  };

  return Object.assign(() => root, { locators, do: interactions });
}
