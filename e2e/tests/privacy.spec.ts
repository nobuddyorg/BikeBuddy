import type { Locator, Page } from '@playwright/test';
import { expect, staticTest } from '../fixtures/api-mocks';

// The privacy notice (#542): a page of its own, linked wherever a rider decides what to share.

async function openedNotice(page: Page, link: Locator): Promise<Page> {
  const [notice] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await notice.waitForLoadState();
  return notice;
}

staticTest('the header, help and profile link the privacy notice', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();

  const fromHeader = await openedNotice(page, on(page).main.locators.privacyLinks.header);
  await expect(on(fromHeader).privacy.locators.title).toHaveText('Privacy notice');
  await fromHeader.close();

  await on(page).main.do.openHelp();
  const fromHelp = await openedNotice(page, on(page).modal.help.locators.privacyLink);
  await expect(on(fromHelp).privacy.locators.title).toHaveText('Privacy notice');
  await fromHelp.close();
  await on(page).modal.help.do.close();

  await on(page).main.do.openProfile();
  const fromProfile = await openedNotice(page, on(page).modal.profile.locators.privacyLink);
  await expect(on(fromProfile).privacy.locators.title).toHaveText('Privacy notice');
});

staticTest('the sign-in prompt links the notice before anyone signs in', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();
  await on(page).main.do.logout();
  await expect(on(page).main.locators.authPrompt).toBeVisible();

  const notice = await openedNotice(page, on(page).main.locators.privacyLinks.signIn);

  await expect(on(notice).privacy.locators.title).toHaveText('Privacy notice');
  await expect(on(notice).privacy.locators.controller).toBeVisible();
  await expect(on(notice).privacy.locators.contact).toHaveAttribute(
    'href',
    'mailto:info@nobuddy.org',
  );
  await on(notice).a11y.check('privacy notice');
});

staticTest.describe('in German', () => {
  staticTest.use({ locale: 'de-DE' });

  staticTest('the notice reads in the rider’s language and leads back', async ({ on, page }) => {
    await page.goto('/privacy.html');

    await expect(on(page).privacy.locators.title).toHaveText('Datenschutzhinweis');
    await expect(page).toHaveTitle('Datenschutzhinweis · BikeBuddy');
    await on(page).privacy.locators.back.click();
    await expect(on(page).main.locators.userMenu).toBeVisible();
  });
});

staticTest.describe('on a phone', () => {
  staticTest.use({ viewport: { width: 360, height: 740 } });

  staticTest('the header leaves the link to help, sign-in and profile', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await expect(on(page).main.locators.privacyLinks.header).toBeHidden();
    await on(page).main.do.openHelp();
    await expect(on(page).modal.help.locators.privacyLink).toBeVisible();
  });
});
