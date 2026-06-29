import { Locator, Page } from '@playwright/test';

interface HelpModal {
  /** Points to self (the modal dialog). */
  (): Locator;
  /** High-level interactions. */
  do: {
    close(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    buttons: {
      close: Locator;
    };
  };
}

export function initHelpModal(page: Page): HelpModal {
  const root = page.locator('#help-modal');
  const locators = {
    buttons: {
      close: page.locator('#btn-close-help'),
    },
  };
  const interactions = {
    close: async () => locators.buttons.close.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
