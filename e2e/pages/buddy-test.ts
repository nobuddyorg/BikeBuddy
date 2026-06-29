import test, { Page } from '@playwright/test';
import { initMainPage } from './main-page';
import { initUploadModal } from './upload-modal';
import { initProfileModal } from './profile-modal';
import { initEditModal } from './edit-modal';
import { initHelpModal } from './help-modal';

// Lazy getters: only the page objects a test actually touches get constructed.
function createPageTree(page: Page) {
  return {
    get main() {
      return initMainPage(page);
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
      };
    },
  };
}

// `on(page)` gives a readable entry point into the page object model, e.g.
//   await on(page).main.do.uploadGpx({ name, gpx });
//   await expect(on(page).modal.profile()).toBeVisible();
export const buddyTest = test.extend<{ on: typeof createPageTree }>({
  on: async ({}, use) => {
    await use((page: Page) => createPageTree(page));
  },
});

export { expect } from '@playwright/test';
