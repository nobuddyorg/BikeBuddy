import { Locator, Page } from '@playwright/test';

interface ProfileModal {
  /** Points to self (the modal dialog). */
  (): Locator;
  /** High-level interactions. */
  do: {
    setName(name: string): Promise<void>;
    saveName(): Promise<void>;
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
    buttons: {
      saveName: Locator;
      exportData: Locator;
      deleteAccount: Locator;
      close: Locator;
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
    buttons: {
      saveName: page.locator('#profile-name-form button[type="submit"]'),
      exportData: page.locator('#btn-export-data'),
      deleteAccount: page.locator('#btn-delete-account'),
      close: page.locator('#btn-close-profile'),
    },
  };
  const interactions = {
    setName: async (name: string) => locators.nameInput.fill(name),
    saveName: async () => locators.buttons.saveName.click(),
    exportData: async () => locators.buttons.exportData.click(),
    deleteAccount: async () => {
      page.once('dialog', (d) => d.accept());
      await locators.buttons.deleteAccount.click();
    },
    close: async () => locators.buttons.close.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
