import { expect, Locator, Page } from '@playwright/test';
import { initUploadModal } from './upload-modal';

type FileInput = string | { name: string; mimeType: string; buffer: Buffer };

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
    addImage(file: FileInput): Promise<void>;
    deleteTour(): Promise<void>;
    showPins(visible: boolean): Promise<void>;
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
    };
    list: {
      container: Locator;
      names: Locator;
      count: Locator;
      empty: Locator;
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
    };
    pins: {
      toggle: Locator;
      toggleInput: Locator;
      markers: Locator;
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
    },
    list: {
      container: page.locator('#tour-list'),
      names: page.locator('#tour-list .tour-item-name'),
      count: page.locator('#tour-count'),
      empty: page.locator('#no-tours'),
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
    },
    pins: {
      toggle: page.locator('#pin-toggle'),
      toggleInput: page.locator('#pin-toggle-input'),
      markers: page.locator('.photo-pin'),
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
    logout: async () => locators.buttons.logout.click(),
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
    addImage: async (file: FileInput) => {
      await locators.image.input.setInputFiles(file);
    },
    deleteTour: async () => {
      page.once('dialog', (d) => d.accept());
      await locators.buttons.deleteTour.click();
    },
    showPins: async (visible: boolean) => {
      if (visible) await locators.pins.toggleInput.check();
      else await locators.pins.toggleInput.uncheck();
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
