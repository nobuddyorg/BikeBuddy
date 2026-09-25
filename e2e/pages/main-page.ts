import { expect, Locator, Page } from '@playwright/test';
import { initProfileModal } from './profile-modal';
import { initTourList } from './tour-list';
import { initUploadModal } from './upload-modal';

interface MainPage {
  /** Points to self (the document body, whose palette follows the colour scheme). */
  (): Locator;
  /** High-level interactions. */
  do: {
    openUpload(): Promise<void>;
    openProfile(): Promise<void>;
    openHelp(): Promise<void>;
    /** Through whichever stats button the layout shows (header or tour list). */
    openStats(): Promise<void>;
    logout(): Promise<void>;
    toggleSidebar(): Promise<void>;
    openMobileMap(): Promise<void>;
    /** Clears what this browser remembers (language, sign-out), as a second device would lack it. */
    forgetLocalSettings(): Promise<void>;
    /** Uploads through the modal; returns once the new tour is open. */
    uploadGpx(upload: { name: string; gpx: string }): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    userMenu: Locator;
    authPrompt: Locator;
    /** Error toasts (role=alert) currently shown. */
    alerts: Locator;
    sidebar: Locator;
    sidebarTitle: Locator;
    buttons: {
      login: Locator;
      upload: Locator;
      profile: Locator;
      help: Locator;
      stats: Locator;
      mapExpand: Locator;
      mobileMapFab: Locator;
    };
  };
}

export function initMainPage(page: Page): MainPage {
  const root = page.locator('body');
  const locators = {
    userMenu: page.locator('#user-menu'),
    authPrompt: page.locator('#auth-prompt'),
    alerts: page.locator('#toasts').getByRole('alert'),
    sidebar: page.locator('#sidebar'),
    sidebarTitle: page.locator('#sidebar-title'),
    buttons: {
      login: page.locator('#btn-login'),
      upload: page.locator('#btn-upload'),
      profile: page.locator('#btn-profile'),
      help: page.locator('#btn-help'),
      stats: page.locator('#btn-stats-header, #btn-stats').filter({ visible: true }).first(),
      mapExpand: page.locator('#btn-map-expand'),
      mobileMapFab: page.locator('#btn-mobile-map-fab'),
    },
  };

  const interactions = {
    openUpload: async () => locators.buttons.upload.click(),
    openProfile: async () => locators.buttons.profile.click(),
    openHelp: async () => locators.buttons.help.click(),
    openStats: async () => locators.buttons.stats.click(),
    // Sign Out lives inside the profile modal.
    logout: async () => {
      await locators.buttons.profile.click();
      await initProfileModal(page).do.logout();
    },
    toggleSidebar: async () => locators.buttons.mapExpand.click(),
    openMobileMap: async () => locators.buttons.mobileMapFab.click(),
    forgetLocalSettings: async () => page.evaluate(() => localStorage.clear()),
    uploadGpx: async ({ name, gpx }: { name: string; gpx: string }) => {
      await locators.buttons.upload.click();
      const upload = initUploadModal(page);
      await upload.do.setName(name);
      await upload.do.pickFile({
        name: 'ride.gpx',
        mimeType: 'application/gpx+xml',
        buffer: Buffer.from(gpx),
      });
      await upload.do.submit();
      await expect(initTourList(page).row(name).locators.content).toHaveAttribute(
        'aria-current',
        'true',
      );
    },
  };

  return Object.assign(() => root, { locators, do: interactions });
}
