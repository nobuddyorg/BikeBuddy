// Lighthouse CI against the frontend served as GitHub Pages serves it, signed
// out and signed in (devMode against a seeded local Functions host).
//   node lighthouse/run.mjs [signed-out|signed-in ...]   (default: both)
// Signed in needs the local stack: ./buddy.sh development start-cosmos,
// start-backend (SKIP_AUTH=true). Reports: e2e/lighthouse-reports/<state>/.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const e2e = fileURLToPath(new URL('..', import.meta.url));
const states = process.argv.slice(2).length ? process.argv.slice(2) : ['signed-out', 'signed-in'];
const env = {
  ...process.env,
  // chrome-launcher reads CHROME_PATH; the e2e suite's Chromium spares a second browser.
  CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath(),
};

for (const state of states) {
  if (state === 'signed-in') {
    console.log('Seeding the local Functions host...');
    execFileSync('node', ['lighthouse/seed.mjs'], { cwd: e2e, env, stdio: 'inherit' });
  }
  console.log(`Running Lighthouse CI (${state})...`);
  execFileSync('npx', ['lhci', 'autorun', `--config=lighthouse/lighthouserc.${state}.json`], {
    cwd: e2e,
    env,
    stdio: 'inherit',
  });
}
