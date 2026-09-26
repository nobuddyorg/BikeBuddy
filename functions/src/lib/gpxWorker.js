// @ts-check
'use strict';

// The worker_threads entry parseGpxOffThread starts: it parses its workerData and posts the result.

const threads = require('node:worker_threads');
const { parseGpx } = require('./parseGpx');

// Errors cross the thread as plain data; parseGpxOffThread turns them back into their classes.
function parseToMessage(bytes) {
  try {
    return { track: parseGpx(Buffer.from(bytes)) };
  } catch (failure) {
    const error = /** @type {Error} */ (failure);
    return { error: { name: error.name, message: error.message } };
  }
}

/** @param {{ isMainThread: boolean, parentPort: any, workerData: any }} thread */
function runInWorker({ isMainThread, parentPort, workerData }) {
  if (!isMainThread) parentPort.postMessage(parseToMessage(workerData));
}

runInWorker(threads);

module.exports = { parseToMessage, runInWorker };
