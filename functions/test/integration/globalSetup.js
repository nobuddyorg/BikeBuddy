'use strict';

const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { resolve } = require('node:path');
const { assertEmulatorTargets } = require('./emulatorGuard');

const HEALTH_URL = 'http://localhost:7071/api/health';
const functionsDirectory = resolve(__dirname, '..', '..');

async function isUp() {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch (error) {
    // Nothing listening yet: fetch rejects with a TypeError whose cause is the socket error.
    if (error instanceof TypeError) return false;
    throw error;
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

function stopProcessGroup(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

// Starts the host for the run, or reuses one already listening; Cosmos and Azurite must run.
module.exports = async function setup() {
  assertEmulatorTargets();
  if (await isUp()) return () => {};

  const child = spawn('func', ['start'], {
    cwd: functionsDirectory,
    env: process.env,
    stdio: 'inherit',
    detached: true,
  });

  if (!(await waitForHealth(150_000))) {
    stopProcessGroup(child);
    throw new Error('Functions host did not become healthy on :7071 within 150s');
  }

  return async () => stopProcessGroup(child);
};
