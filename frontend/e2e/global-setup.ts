import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Ensure src/config.js exists with devMode enabled so the app boots without
// MSAL/Azure during tests. Only created if missing (never clobbers a local one).
export default function globalSetup() {
  const here = dirname(fileURLToPath(import.meta.url));
  const configPath = resolve(here, '../src/config.js');
  if (existsSync(configPath)) return;

  writeFileSync(
    configPath,
    `'use strict';
window.BIKEBUDDY_CONFIG = {
  apiBaseUrl: '',
  entraSubdomain: '',
  entraClientId: '',
  entraApiScope: '',
  devMode: true,
};
`,
  );
}
