import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Ensure frontend/config.js exists with devMode enabled so the app boots without
// MSAL/Azure during tests. Only created if missing (never clobbers a local one).
export default function globalSetup() {
  const here = dirname(fileURLToPath(import.meta.url));
  const configPath = resolve(here, '../frontend/config.js');
  if (existsSync(configPath)) return;

  writeFileSync(
    configPath,
    `'use strict';
const BIKEBUDDY_CONFIG = {
  b2cTenant: 'test.onmicrosoft.com',
  b2cClientId: 'test-client-id',
  b2cPolicy: 'B2C_1_signupsignin',
  b2cApiScope: 'https://test.onmicrosoft.com/api/user_impersonation',
  devMode: true,
};
`,
  );
}
