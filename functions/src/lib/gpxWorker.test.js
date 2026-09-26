'use strict';

const { parseToMessage, runInWorker } = require('./gpxWorker');

const GPX = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
  <trkpt lat="48.1" lon="11.5"/><trkpt lat="48.2" lon="11.6"/>
</trkseg></trk></gpx>`;

describe('parseToMessage', () => {
  it('carries the parsed track, from the bytes a thread receives', () => {
    const message = parseToMessage(new Uint8Array(Buffer.from(GPX)));

    expect(message.track.heatmapData).toEqual([
      [48.1, 11.5],
      [48.2, 11.6],
    ]);
  });

  it("carries a refused file's error as name and message", () => {
    expect(parseToMessage(Buffer.from('<gpx version="1.1"><trk/></gpx>'))).toEqual({
      error: { name: 'NoTrackPointsError', message: 'GPX file has no track points' },
    });
    expect(parseToMessage(Buffer.from('not xml'))).toEqual({
      error: { name: 'InvalidGpxError', message: 'Not a valid GPX file' },
    });
  });
});

describe('runInWorker', () => {
  it('parses its workerData and posts the result when it runs in a worker', () => {
    const parentPort = { postMessage: vi.fn() };

    runInWorker({ isMainThread: false, parentPort, workerData: Buffer.from(GPX) });

    expect(parentPort.postMessage).toHaveBeenCalledWith({ track: expect.any(Object) });
  });

  it('does nothing when loaded on the main thread', () => {
    const parentPort = { postMessage: vi.fn() };

    runInWorker({ isMainThread: true, parentPort, workerData: Buffer.from(GPX) });

    expect(parentPort.postMessage).not.toHaveBeenCalled();
  });
});
