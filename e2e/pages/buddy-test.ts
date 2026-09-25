import test, { expect, Page } from '@playwright/test';
import { expectNoAxeViolations } from '../axe';
import { coverageEnabled, coverageReport, type Suite } from '../coverage';
import { initMainPage } from './main-page';
import { initTourList } from './tour-list';
import { initDetailPanel } from './detail-panel';
import { initMapView } from './map-view';
import { initUploadModal } from './upload-modal';
import { initProfileModal } from './profile-modal';
import { initEditModal } from './edit-modal';
import { initHelpModal } from './help-modal';
import { initStatsModal } from './stats-modal';
import { initConfirmModal } from './confirm-modal';
import { initLightbox } from './lightbox';

// A transparent 1x1 PNG: map tiles never leave the machine.
const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

// Lazy getters: only the page objects a test actually touches get constructed.
function createPageTree(page: Page) {
  return {
    // WCAG 2.x A/AA scan of the page as it is now (e2e/axe.ts).
    a11y: {
      check: (context: string) => expectNoAxeViolations(page, context),
    },
    get main() {
      return initMainPage(page);
    },
    get list() {
      return initTourList(page);
    },
    get detail() {
      return initDetailPanel(page);
    },
    get map() {
      return initMapView(page);
    },
    get modal() {
      return {
        get upload() {
          return initUploadModal(page);
        },
        get profile() {
          return initProfileModal(page);
        },
        get edit() {
          return initEditModal(page);
        },
        get help() {
          return initHelpModal(page);
        },
        get stats() {
          return initStatsModal(page);
        },
        get confirm() {
          return initConfirmModal(page);
        },
        get lightbox() {
          return initLightbox(page);
        },
      };
    },
  };
}

// `on(page)` is the entry into the page-object tree, e.g. on(page).list.row(name).do.tap().
interface BuddyFixtures {
  on: typeof createPageTree;
  /** Console errors a test causes on purpose (e.g. a mocked 500), matched against text and URL. */
  allowedConsoleErrors: { matching: RegExp[] };
  jsCoverage: void;
  offlineBasemap: void;
  failOnPageErrors: void;
}

export const buddyTest = test.extend<BuddyFixtures>({
  on: async ({}, use) => {
    await use((page: Page) => createPageTree(page));
  },
  allowedConsoleErrors: [{ matching: [] }, { option: true }],
  // Automatic: every test's page adds its V8 JS coverage when E2E_COVERAGE=1 (coverage.ts).
  jsCoverage: [
    async ({ page }, use) => {
      if (!coverageEnabled()) return use();
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      const entries = await page.coverage.stopJSCoverage();
      await coverageReport((process.env.E2E_SUITE as Suite) ?? 'static').add(entries);
    },
    { auto: true },
  ],
  offlineBasemap: [
    async ({ page }, use) => {
      await page.route('https://*.basemaps.cartocdn.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }),
      );
      await use();
    },
    { auto: true },
  ],
  // A rejected background request or an uncaught exception fails the test, even when its assertions pass.
  failOnPageErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const unexpected: string[] = [];
      page.on('pageerror', (error) => unexpected.push(`uncaught: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = `${message.text()} ${message.location().url}`;
        if (allowedConsoleErrors.matching.some((allowed) => allowed.test(text))) return;
        unexpected.push(`console.error: ${text}`);
      });
      await use();
      expect(unexpected, 'unexpected errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});
