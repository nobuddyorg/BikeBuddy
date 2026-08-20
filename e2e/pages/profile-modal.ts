import { Locator, Page } from '@playwright/test';

interface ProfileModal {
  /** Points to self (the modal dialog). */
  (): Locator;
  /** High-level interactions. */
  do: {
    setName(name: string): Promise<void>;
    saveName(): Promise<void>;
    switchLanguage(opts: { search: string; pick: string }): Promise<void>;
    exportData(): Promise<void>;
    deleteAccount(): Promise<void>;
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
      options: Locator;
    };
    buttons: {
      saveName: Locator;
      exportData: Locator;
      deleteAccount: Locator;
      close: Locator;
    };
    deleteAccountModal: {
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
      options: page.locator('.lang-option'),
    },
    buttons: {
      saveName: page.locator('#profile-name-form button[type="submit"]'),
      exportData: page.locator('#btn-export-data'),
      deleteAccount: page.locator('#btn-delete-account'),
      close: page.locator('#btn-close-profile'),
    },
    deleteAccountModal: {
      input: page.locator('#delete-account-input'),
      confirm: page.locator('#btn-delete-account-confirm'),
    },
  };
  const interactions = {
    setName: async (name: string) => locators.nameInput.fill(name),
    saveName: async () => locators.buttons.saveName.click(),
    switchLanguage: async ({ search, pick }: { search: string; pick: string }) => {
      await locators.lang.button.click();
      await locators.lang.search.fill(search);
      await locators.lang.options.filter({ hasText: pick }).click();
    },
    exportData: async () => locators.buttons.exportData.click(),
    deleteAccount: async () => {
      await locators.buttons.deleteAccount.click();
      await locators.deleteAccountModal.input.fill('DELETE');
      await locators.deleteAccountModal.confirm.click();
    },
    close: async () => locators.buttons.close.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
