import { expect, staticTest } from '../fixtures/api-mocks';

// The palette's values and contrast are pinned by frontend/test/contrast.test.js.

staticTest.describe('system dark/light mode', () => {
  staticTest('light OS preference renders light map tiles', async ({ on, page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    await expect(on(page).map()).toHaveAttribute('data-tiles', 'light');
    await on(page).a11y.check('light theme');
  });

  staticTest('dark OS preference renders dark map tiles', async ({ on, page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    await expect(on(page).map()).toHaveAttribute('data-tiles', 'dark');
    await on(page).a11y.check('dark theme');
  });

  staticTest('switching the OS theme live updates both CSS and map tiles', async ({ on, page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(on(page).map()).toHaveAttribute('data-tiles', 'light');
    const lightBackground = await on(page)
      .main()
      .evaluate((body) => getComputedStyle(body).backgroundColor);

    await page.emulateMedia({ colorScheme: 'dark' });

    await expect(on(page).main()).not.toHaveCSS('background-color', lightBackground);
    await expect(on(page).map()).toHaveAttribute('data-tiles', 'dark');
  });
});
