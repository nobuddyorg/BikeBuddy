import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { coverageEnabled, coverageReport, type Suite } from './coverage';
import { assertEmulatorSettings } from './emulator-guard';

const CONFIG_PATH = fileURLToPath(new URL('../frontend/src/config.js', import.meta.url));

// devMode against the same origin's /api, which the SWA CLI proxies to the local host.
const FULLSTACK_CONFIG = {
  apiBaseUrl: '',
  entraSubdomain: '',
  entraClientId: '',
  entraApiScope: '',
  devMode: true,
};

interface FrontendConfig {
  apiBaseUrl?: unknown;
  devMode?: unknown;
}

function readFrontendConfig(): FrontendConfig {
  const sandbox: { window: { BIKEBUDDY_CONFIG?: FrontendConfig } } = { window: {} };
  runInNewContext(readFileSync(CONFIG_PATH, 'utf8'), sandbox); // nosemgrep: scripts.quality.bikebuddy.no-runtime-code -- the developer's own config.js, in a sandbox, never shipped
  return sandbox.window.BIKEBUDDY_CONFIG ?? {};
}

// The SWA CLI serves config.js from disk: one pointing at another backend stops the run.
function ensureFullStackConfig() {
  if (!existsSync(CONFIG_PATH)) {
    const source = `'use strict';\nwindow.BIKEBUDDY_CONFIG = ${JSON.stringify(FULLSTACK_CONFIG, null, 2)};\n`;
    writeFileSync(CONFIG_PATH, source);
    return;
  }
  const { apiBaseUrl, devMode } = readFrontendConfig();
  if (apiBaseUrl !== '' || devMode !== true) {
    throw new Error(
      `frontend/src/config.js has apiBaseUrl ${JSON.stringify(apiBaseUrl)} and devMode ` +
        `${JSON.stringify(devMode)}; the full-stack suite needs apiBaseUrl '' and devMode true. ` +
        'Move the file aside and the suite writes one.',
    );
  }
}

export default function globalSetup() {
  const suite = (process.env.E2E_SUITE as Suite) ?? 'static';
  // A previous run's per-worker coverage must not leak into this report.
  if (coverageEnabled()) coverageReport(suite).cleanCache();
  if (suite !== 'fullstack') return;
  assertEmulatorSettings();
  ensureFullStackConfig();
}
