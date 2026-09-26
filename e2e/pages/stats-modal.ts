import { Locator, Page } from '@playwright/test';

interface StatsModal {
  /** Points to self (the modal dialog). */
  (): Locator;
  /** High-level interactions. */
  do: {
    close(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    totalDistance: Locator;
    totalCount: Locator;
    buttons: {
      close: Locator;
    };
  };
}

export function initStatsModal(page: Page): StatsModal {
  const root = page.locator('#stats-modal');
  const locators = {
    totalDistance: page.locator('#stats-total-distance'),
    totalCount: page.locator('#stats-total-count'),
    buttons: {
      close: page.locator('#btn-close-stats'),
    },
  };
  const interactions = {
    close: async () => locators.buttons.close.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
