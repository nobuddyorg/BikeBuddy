import { Locator, Page } from '@playwright/test';

interface ProfileModal {
  /** Points to self (the modal dialog). */
  (): Locator;
  /** High-level interactions. */
  do: {
    setName(name: string): Promise<void>;
    saveName(): Promise<void>;
    /** Filters the language menu by `search`, then picks the locale `code` (e.g. 'de'). */
    switchLanguage(language: { search: string; code: string }): Promise<void>;
    exportData(): Promise<void>;
    logout(): Promise<void>;
    deleteAccount(): Promise<void>;
    openDeleteAccount(): Promise<void>;
    openLanguageMenu(): Promise<void>;
    close(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    title: Locator;
    email: Locator;
    since: Locator;
    nameInput: Locator;
    nameError: Locator;
    lang: {
      button: Locator;
      menu: Locator;
      search: Locator;
      option(code: string): Locator;
    };
    buttons: {
      saveName: Locator;
      logout: Locator;
      exportData: Locator;
      deleteAccount: Locator;
      close: Locator;
    };
    deleteAccountModal: {
      root: Locator;
      input: Locator;
      confirm: Locator;
    };
  };
}

export function initProfileModal(page: Page): ProfileModal {
  const root = page.locator('#profile-modal');
  const locators = {
    title: page.locator('#profile-modal-title'),
    email: page.locator('#profile-email'),
    since: page.locator('#profile-since'),
    nameInput: page.locator('#profile-name-input'),
    nameError: page.locator('#profile-name-error'),
    lang: {
      button: page.locator('#btn-lang'),
      menu: page.locator('#lang-menu'),
      search: page.locator('#lang-search'),
      option: (code: string) => page.locator(`#lang-option-${code}`),
    },
    buttons: {
      saveName: page.locator('#btn-save-profile-name'),
      logout: page.locator('#btn-logout'),
      exportData: page.locator('#btn-export-data'),
      deleteAccount: page.locator('#btn-delete-account'),
      close: page.locator('#btn-close-profile'),
    },
    deleteAccountModal: {
      root: page.locator('#delete-account-modal'),
      input: page.locator('#delete-account-input'),
      confirm: page.locator('#btn-delete-account-confirm'),
    },
  };
  const interactions = {
    setName: async (name: string) => locators.nameInput.fill(name),
    saveName: async () => locators.buttons.saveName.click(),
    switchLanguage: async ({ search, code }: { search: string; code: string }) => {
      await locators.lang.button.click();
      await locators.lang.search.fill(search);
      await locators.lang.option(code).click();
    },
    exportData: async () => locators.buttons.exportData.click(),
    logout: async () => locators.buttons.logout.click(),
    deleteAccount: async () => {
      await locators.buttons.deleteAccount.click();
      await locators.deleteAccountModal.input.fill('DELETE');
      await locators.deleteAccountModal.confirm.click();
    },
    openDeleteAccount: async () => locators.buttons.deleteAccount.click(),
    openLanguageMenu: async () => locators.lang.button.click(),
    close: async () => locators.buttons.close.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
