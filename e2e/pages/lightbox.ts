import { Locator, Page } from '@playwright/test';

interface Lightbox {
  /** Points to self (the full-screen photo viewer). */
  (): Locator;
  /** High-level interactions. */
  do: {
    close(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    image: Locator;
    buttons: {
      close: Locator;
    };
  };
}

export function initLightbox(page: Page): Lightbox {
  const root = page.locator('#lightbox');
  const locators = {
    image: page.locator('#lightbox-img'),
    buttons: {
      close: page.locator('#btn-close-lightbox'),
    },
  };
  const interactions = {
    close: async () => locators.buttons.close.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
