import { expect, fullstackTest } from './fullstack-test';
import { devUserTours } from './store';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Journey Tour</name><time>2026-05-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
  </trkseg></trk>
</gpx>`;

fullstackTest.describe('user journeys', () => {
  fullstackTest('edit a tour: rename updates the list and detail panel', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await on(page).main.do.uploadGpx({ name: 'Original Name', gpx: GPX });

    await expect(on(page).detail.locators.name).toHaveText('Original Name');

    await on(page).detail.do.openEdit();
    await expect(on(page).modal.edit()).toBeVisible();
    await on(page).a11y.check('edit tour modal');
    await on(page).modal.edit.do.setName('Renamed Tour');
    await on(page).modal.edit.do.setDescription('Now with a description');
    await on(page).modal.edit.do.submit();

    await expect(on(page).modal.edit()).toBeHidden();
    await expect(on(page).detail.locators.name).toHaveText('Renamed Tour');
    await expect(on(page).detail.locators.description).toHaveText('Now with a description');
    await expect(on(page).list.locators.container).toContainText('Renamed Tour');
    await expect(on(page).list.locators.container).not.toContainText('Original Name');
    // Stored, not only shown (#567).
    await expect
      .poll(async () =>
        (await devUserTours()).map(({ name, description }) => ({ name, description })),
      )
      .toEqual([{ name: 'Renamed Tour', description: 'Now with a description' }]);
  });

  fullstackTest(
    'edit a tour: correcting the date updates the detail panel',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();
      await on(page).main.do.uploadGpx({ name: 'Dated Tour', gpx: GPX });

      // The GPX's <time> puts the tour on 1 May 2026.
      await expect(on(page).detail.locators.date).toHaveText('1 May 2026');

      await on(page).detail.do.openEdit();
      await expect(on(page).modal.edit()).toBeVisible();
      await expect(on(page).modal.edit.locators.date).toHaveValue('2026-05-01');
      await on(page).modal.edit.do.setDate('2026-06-15');
      await on(page).modal.edit.do.submit();

      await expect(on(page).modal.edit()).toBeHidden();
      await expect(on(page).detail.locators.date).toHaveText('15 Jun 2026');
      // Stored as the browser's own calendar day, whatever the runner's time zone.
      const storedDays = async () => {
        const stored = (await devUserTours()).map(({ createdAt }) => createdAt);
        return page.evaluate(
          (dates) => dates.map((iso) => new Date(iso).toLocaleDateString('en-CA')),
          stored,
        );
      };
      await expect.poll(storedDays).toEqual(['2026-06-15']);
    },
  );

  fullstackTest(
    'edit display name updates the avatar initials and persists',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.openProfile();
      await expect(on(page).modal.profile()).toBeVisible();
      await on(page).modal.profile.do.setName('Alpine Rider');
      await on(page).modal.profile.do.saveName();

      // Avatar shows first+last initials: "Alpine Rider" → "AR".
      await expect(on(page).main.locators.buttons.profile).toHaveText('AR');

      // After a reload, GET /api/v1/me must return the chosen name, not the token's name claim.
      await page.reload();
      await expect(on(page).main.locators.buttons.profile).toHaveText('AR');
      await on(page).main.do.openProfile();
      await expect(on(page).modal.profile.locators.nameInput).toHaveValue('Alpine Rider');
      await expect(on(page).modal.profile.locators.title).toHaveText('Alpine Rider');
    },
  );

  fullstackTest(
    'profile shows the provisioned email and a real join date',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.userMenu).toBeVisible();

      await on(page).main.do.openProfile();
      await expect(on(page).modal.profile()).toBeVisible();
      await expect(on(page).modal.profile.locators.email).toContainText('@');
      // "Member since" must be a real date, not the "—" placeholder.
      await expect(on(page).modal.profile.locators.since).not.toHaveText('—');
    },
  );

  // The API answers these with 400, which the browser logs.
  fullstackTest.describe('rejected edits', () => {
    fullstackTest.use({ allowedConsoleErrors: { matching: [/status of 400/] } });

    fullstackTest(
      'rejects a whitespace-only tour name and keeps the modal open',
      async ({ on, page }) => {
        await page.goto('/');
        await expect(on(page).main.locators.userMenu).toBeVisible();
        await on(page).main.do.uploadGpx({ name: 'Keep Me', gpx: GPX });

        await on(page).detail.do.openEdit();
        await expect(on(page).modal.edit()).toBeVisible();
        // `required` blocks an empty name in the browser; whitespace reaches the API's 400.
        await on(page).modal.edit.do.setName('   ');
        await on(page).modal.edit.do.submit();

        await expect(on(page).modal.edit()).toBeVisible();
        await expect(on(page).modal.edit.locators.error).toBeVisible();
        await expect(on(page).detail.locators.name).toHaveText('Keep Me');
      },
    );

    fullstackTest(
      'rejects an empty profile name and keeps the previous one',
      async ({ on, page }) => {
        await page.goto('/');
        await expect(on(page).main.locators.userMenu).toBeVisible();

        await on(page).main.do.openProfile();
        await expect(on(page).modal.profile()).toBeVisible();
        await on(page).modal.profile.do.setName('Valid Name');
        await on(page).modal.profile.do.saveName();
        await expect(on(page).main.locators.buttons.profile).toHaveText('VN');

        await on(page).modal.profile.do.setName('');
        await on(page).modal.profile.do.saveName();

        await expect(on(page).modal.profile.locators.nameError).toBeVisible();
        await expect(on(page).main.locators.buttons.profile).toHaveText('VN');
      },
    );
  });
});
