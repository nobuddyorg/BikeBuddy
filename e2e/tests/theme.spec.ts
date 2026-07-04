import { buddyTest, expect } from '../pages/buddy-test';

// #216: site chrome and map tiles follow the OS prefers-color-scheme setting,
// including live updates if the OS theme changes mid-session. These run
// against the static frontend (no backend) since theming is presentation-only.

buddyTest.describe('system dark/light mode', () => {
  buddyTest('light OS preference renders the light palette and Voyager tiles', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(248, 250, 252)');

    await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /voyager/);
  });

  buddyTest(
    'dark OS preference renders the dark palette and Dark Matter tiles',
    async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/');

      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe('rgb(15, 17, 23)');

      await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /dark_all/);
    },
  );

  buddyTest('switching the OS theme live updates both CSS and map tiles', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /voyager/);

    await page.emulateMedia({ colorScheme: 'dark' });

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(15, 17, 23)');
    await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /dark_all/);
  });
});
