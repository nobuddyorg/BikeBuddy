import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// devMode lets the SWA-served app boot without MSAL/Azure. Never clobbers an
// existing config.js.
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
