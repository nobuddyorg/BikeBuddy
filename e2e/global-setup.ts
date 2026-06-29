import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Ensure frontend/src/config.js exists with devMode enabled so the SWA-served
// app boots without MSAL/Azure. Only created if missing (never clobbers one).
export default function globalSetup() {
  const here = dirname(fileURLToPath(import.meta.url));
  const configPath = resolve(here, '../frontend/src/config.js');
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
