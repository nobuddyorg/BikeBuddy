import { buddyTest } from '../pages/buddy-test';
import { createSeeder, type Seeder } from './seed';
import { resetDevUser } from './store';

// Every request runs as the one SKIP_AUTH user until per-test identities reach this suite
// (#584), so tests run one at a time and each starts and ends with that user's documents
// and blobs gone; the teardown runs even when the test failed.
export const fullstackTest = buddyTest.extend<{ seed: Seeder }>({
  page: async ({ page }, use) => {
    await resetDevUser();
    await use(page);
    // Closed first, so no request of the page lands after the cleanup.
    await page.close();
    await resetDevUser();
  },
  seed: async ({ request }, use) => {
    await use(createSeeder(request));
  },
});

export { expect } from '@playwright/test';
