'use strict';

const { EventEmitter } = require('node:events');
const {
  parseGpxOffThread,
  parseInWorker,
  createParseQueue,
  toError,
} = require('./parseGpxOffThread');
const { InvalidGpxError, NoTrackPointsError } = require('./parseGpx');

const GPX = Buffer.from(`<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
  <trkpt lat="48.1" lon="11.5"/><trkpt lat="48.2" lon="11.6"/>
</trkseg></trk></gpx>`);

// Stands in for Worker: records how it was started and lets a test play its events.
function fakeWorkerThread() {
  const started = [];
  class FakeWorker extends EventEmitter {
    constructor(path, options) {
      super();
      started.push({ path, options, worker: this });
    }
  }
  return { FakeWorker, started };
}

describe('parseGpxOffThread (a real worker thread)', () => {
  it('parses a GPX file on another thread', async () => {
    const track = await parseGpxOffThread(GPX);

    expect(track.heatmapData).toEqual([
      [48.1, 11.5],
      [48.2, 11.6],
    ]);
  });

  it("rejects with the parser's own error classes", async () => {
    await expect(parseGpxOffThread(Buffer.from('not xml'))).rejects.toBeInstanceOf(InvalidGpxError);
    await expect(
      parseGpxOffThread(Buffer.from('<gpx version="1.1"><trk/></gpx>')),
    ).rejects.toBeInstanceOf(NoTrackPointsError);
  });
});

describe('parseInWorker', () => {
  it('starts gpxWorker.js with the bytes and a bounded heap', () => {
    const { FakeWorker, started } = fakeWorkerThread();

    parseInWorker(GPX, { WorkerThread: FakeWorker });

    expect(started).toEqual([
      {
        path: require.resolve('./gpxWorker'),
        options: { workerData: GPX, resourceLimits: { maxOldGenerationSizeMb: 512 } },
        worker: expect.any(FakeWorker),
      },
    ]);
  });

  it('refuses a file that exhausts the heap as an invalid GPX file', async () => {
    const { FakeWorker, started } = fakeWorkerThread();
    const parsing = parseInWorker(GPX, { WorkerThread: FakeWorker });

    const outOfMemory = Object.assign(new Error('heap'), { code: 'ERR_WORKER_OUT_OF_MEMORY' });
    started[0].worker.emit('error', outOfMemory);

    const error = await parsing.catch((failure) => failure);
    expect(error).toBeInstanceOf(InvalidGpxError);
    expect(error.message).toBe('GPX file needs too much memory to parse');
    expect(error.cause).toBe(outOfMemory);
  });

  it('passes any other worker failure on as it is', async () => {
    const { FakeWorker, started } = fakeWorkerThread();
    const parsing = parseInWorker(GPX, { WorkerThread: FakeWorker });

    const crash = new TypeError('boom');
    started[0].worker.emit('error', crash);

    await expect(parsing).rejects.toBe(crash);
  });

  it('rejects when the worker exits without an answer', async () => {
    const { FakeWorker, started } = fakeWorkerThread();
    const parsing = parseInWorker(GPX, { WorkerThread: FakeWorker });

    started[0].worker.emit('exit', 1);

    await expect(parsing).rejects.toThrow('GPX worker exited with code 1');
  });

  it('keeps the answer when the worker exits after posting it', async () => {
    const { FakeWorker, started } = fakeWorkerThread();
    const parsing = parseInWorker(GPX, { WorkerThread: FakeWorker });

    started[0].worker.emit('message', { track: { name: 'Ride' } });
    started[0].worker.emit('exit', 0);

    await expect(parsing).resolves.toEqual({ name: 'Ride' });
  });
});

describe('toError', () => {
  it('rebuilds the error classes a thread cannot carry', () => {
    expect(toError({ name: 'NoTrackPointsError', message: 'x' })).toBeInstanceOf(
      NoTrackPointsError,
    );
    const invalid = toError({ name: 'InvalidGpxError', message: 'Not a valid GPX file' });
    expect(invalid).toBeInstanceOf(InvalidGpxError);
    expect(invalid.message).toBe('Not a valid GPX file');
  });

  it('makes anything else a plain Error, so it stays a server fault', () => {
    const error = toError({ name: 'RangeError', message: 'Maximum call stack size exceeded' });
    expect(error).not.toBeInstanceOf(InvalidGpxError);
    expect(error.message).toBe('Maximum call stack size exceeded');
  });
});

describe('createParseQueue', () => {
  // A parse that finishes only when the test says so.
  function controllableParses() {
    const pending = [];
    const runParse = vi.fn(
      (bytes) => new Promise((resolve, reject) => pending.push({ bytes, resolve, reject })),
    );
    return { pending, runParse };
  }

  it('runs at most maxConcurrent parses and starts the next as one ends', async () => {
    const { pending, runParse } = controllableParses();
    const parse = createParseQueue({ maxConcurrent: 2, runParse });

    const results = ['a', 'b', 'c'].map((bytes) => parse(bytes));
    expect(runParse.mock.calls.map(([bytes]) => bytes)).toEqual(['a', 'b']);

    pending[0].resolve('track a');
    await expect(results[0]).resolves.toBe('track a');
    expect(runParse.mock.calls.map(([bytes]) => bytes)).toEqual(['a', 'b', 'c']);
  });

  it('frees the slot of a failed parse as well', async () => {
    const { pending, runParse } = controllableParses();
    const parse = createParseQueue({ maxConcurrent: 1, runParse });

    const first = parse('a');
    const second = parse('b');
    pending[0].reject(new Error('bad file'));

    await expect(first).rejects.toThrow('bad file');
    pending[1].resolve('track b');
    await expect(second).resolves.toBe('track b');
  });
});
