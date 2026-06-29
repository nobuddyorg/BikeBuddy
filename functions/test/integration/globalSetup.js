'use strict';

const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { resolve } = require('node:path');

const HEALTH_URL = 'http://localhost:7071/api/health';
const functionsDir = resolve(__dirname, '..', '..');

async function isUp() {
  try {
    const res = await fetch(HEALTH_URL);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp()) return true;
    await sleep(2000);
  }
  return false;
}

// Start the Azure Functions host for the integration run and stop it after.
// If a host is already listening (e.g. a local dev stack), reuse it untouched.
// Cosmos + Azurite must already be running (CI starts them; locally use buddy.sh).
module.exports = async function setup() {
  if (await isUp()) return () => {};

  const child = spawn('func', ['start'], {
    cwd: functionsDir,
    env: process.env,
    stdio: 'inherit',
    detached: true,
  });

  const healthy = await waitForHealth(150_000);
  if (!healthy) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    throw new Error('Functions host did not become healthy on :7071 within 150s');
  }

  return async () => {
    try {
      process.kill(-child.pid, 'SIGTERM'); // kill the detached process group
    } catch {
      /* already gone */
    }
  };
};
