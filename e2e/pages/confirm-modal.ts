import { Locator, Page } from '@playwright/test';

interface ConfirmModal {
  /** Points to self (the modal dialog). */
  (): Locator;
  /** High-level interactions. */
  do: {
    confirm(): Promise<void>;
    dismiss(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    message: Locator;
    buttons: {
      ok: Locator;
      cancel: Locator;
    };
  };
}

export function initConfirmModal(page: Page): ConfirmModal {
  const root = page.locator('#confirm-modal');
  const locators = {
    message: page.locator('#confirm-modal-message'),
    buttons: {
      ok: page.locator('#btn-confirm-ok'),
      cancel: page.locator('#btn-confirm-cancel'),
    },
  };
  const interactions = {
    confirm: async () => locators.buttons.ok.click(),
    dismiss: async () => locators.buttons.cancel.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
