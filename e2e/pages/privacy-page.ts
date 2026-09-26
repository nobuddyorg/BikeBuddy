import { Locator, Page } from '@playwright/test';

/** privacy.html (#542): the notice, a page of its own. */
interface PrivacyPage {
  /** Points to self (the notice). */
  (): Locator;
  /** Raw locators. */
  locators: {
    title: Locator;
    controller: Locator;
    back: Locator;
  };
}

export function initPrivacyPage(page: Page): PrivacyPage {
  const root = page.locator('main.privacy');
  const locators = {
    title: page.locator('#privacy-title'),
    controller: page.locator('#privacy-controller'),
    back: page.locator('#privacy-back'),
  };
  return Object.assign(() => root, { locators });
}
