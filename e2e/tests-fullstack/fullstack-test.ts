import { buddyTest } from '../pages/buddy-test';
import { createSeeder, type Seeder } from './seed';
import { resetDevUser } from './store';

// Every request runs as the one SKIP_AUTH user, so each test starts and ends without its data.
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

// A delete request waits out the Undo window (frontend/src/ui/undoableAction.js) first.
export const AFTER_UNDO_WINDOW = { timeout: 20_000 };
