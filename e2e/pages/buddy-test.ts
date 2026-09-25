import test, { Page } from '@playwright/test';
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
import { initConfirmModal } from './confirm-modal';
import { initLightbox } from './lightbox';

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

// `on(page)` gives a readable entry point into the page object model, e.g.
//   await on(page).main.do.uploadGpx({ name, gpx });
//   await on(page).list.row(name).do.tap();
//   await expect(on(page).modal.profile()).toBeVisible();
export const buddyTest = test.extend<{ on: typeof createPageTree; jsCoverage: void }>({
  on: async ({}, use) => {
    await use((page: Page) => createPageTree(page));
  },
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
});

export { expect } from '@playwright/test';
