// @ts-check
'use strict';

const { Worker } = require('node:worker_threads');
const { InvalidGpxError, NoTrackPointsError } = require('./parseGpx');

const WORKER_PATH = require.resolve('./gpxWorker');
// A parse holds the whole XML tree, many times the file's size: two at once bound an instance.
const MAX_CONCURRENT_PARSES = 2;
// A crafted file that needs more heap is refused as not a GPX file, not a crash of the instance.
const WORKER_HEAP_MB = 512;

// UploadTour tells a client's bad file from a bug by these classes, so they must survive the thread.
function toError({ name, message }) {
  if (name === 'NoTrackPointsError') return new NoTrackPointsError();
  if (name === 'InvalidGpxError') return new InvalidGpxError(message);
  return new Error(message);
}

function workerFailure(error) {
  if (error.code !== 'ERR_WORKER_OUT_OF_MEMORY') return error;
  return new InvalidGpxError('GPX file needs too much memory to parse', { cause: error });
}

/** @returns {Promise<ReturnType<typeof import('./parseGpx').parseGpx>>} */
function parseInWorker(bytes, { WorkerThread = Worker } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new WorkerThread(WORKER_PATH, {
      workerData: bytes,
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    worker.once('message', (message) =>
      message.error ? reject(toError(message.error)) : resolve(message.track),
    );
    worker.once('error', (error) => reject(workerFailure(error)));
    // Only reached without a message: once settled, a promise ignores it.
    worker.once('exit', (code) => reject(new Error(`GPX worker exited with code ${code}`)));
  });
}

// Runs at most maxConcurrent parses; the rest wait in arrival order.
function createParseQueue({ maxConcurrent, runParse }) {
  let running = 0;
  const waiting = [];
  const startNext = () => {
    if (running >= maxConcurrent || waiting.length === 0) return;
    running++;
    const { bytes, resolve, reject } = waiting.shift();
    runParse(bytes)
      .then(resolve, reject)
      .finally(() => {
        running--;
        startNext();
      });
  };
  return (bytes) =>
    new Promise((resolve, reject) => {
      waiting.push({ bytes, resolve, reject });
      startNext();
    });
}

// The request thread keeps serving other requests while a large GPX file parses.
const parseGpxOffThread = createParseQueue({
  maxConcurrent: MAX_CONCURRENT_PARSES,
  runParse: (bytes) => parseInWorker(bytes),
});

module.exports = { parseGpxOffThread, parseInWorker, createParseQueue, toError };
