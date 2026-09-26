'use strict';

const {
  newTrackDocument,
  readTourTrack,
  readTracksByTour,
  readTracksOfTours,
} = require('./tourTrack');
const { fakeToursContainer, fakeTracksContainer } = require('../../test/fakes/cosmosContainer');

const POINTS = [
  [48.1, 11.5],
  [48.2, 11.6],
  [52.5, 13.4],
];
const ONE_LINE = { heatmapData: [], segmentStarts: [] };

describe('newTrackDocument', () => {
  it("files the points and segment starts under the tour's id in the rider's partition", () => {
    expect(
      newTrackDocument({ tourId: 't1', userId: 'u1', heatmapData: POINTS, segmentStarts: [2] }),
    ).toStrictEqual({
      id: 't1',
      userId: 'u1',
      schemaVersion: 1,
      heatmapData: POINTS,
      segmentStarts: [2],
    });
  });
});

describe('readTourTrack', () => {
  const read = (tour, tracks) =>
    readTourTrack({ tour, userId: 'u1', tracksContainer: () => fakeTracksContainer(tracks) });

  it("reads the track item under the tour's id, segment starts included", async () => {
    const stored = { id: 't1', userId: 'u1', heatmapData: POINTS, segmentStarts: [2] };

    expect(await read({ id: 't1' }, [stored])).toEqual({
      heatmapData: POINTS,
      segmentStarts: [2],
    });
  });

  it("never reads another rider's track under the same id", async () => {
    expect(await read({ id: 't1' }, [{ id: 't1', userId: 'u2', heatmapData: POINTS }])).toEqual(
      ONE_LINE,
    );
  });

  it('answers an empty line for a missing track or one without points', async () => {
    expect(await read({ id: 't1' }, [])).toEqual(ONE_LINE);
    expect(await read({ id: 't1' }, [{ id: 't1', userId: 'u1' }])).toEqual(ONE_LINE);
  });

  it('answers the points a tour from before #615 holds itself, as one line', async () => {
    expect(await read({ id: 't1', heatmapData: [[1, 2]] }, [])).toEqual({
      heatmapData: [[1, 2]],
      segmentStarts: [],
    });
  });
});

describe('readTracksByTour', () => {
  it('maps every tour id of the rider to its track, moved or still inline', async () => {
    const tours = fakeToursContainer([
      { id: 'old', userId: 'u1', heatmapData: [[1, 2]] },
      { id: 'new', userId: 'u1', pointCount: 3 },
      { id: 'other', userId: 'u2', heatmapData: [[3, 4]] },
    ]);
    const tracks = fakeTracksContainer([
      { id: 'new', userId: 'u1', heatmapData: POINTS, segmentStarts: [2] },
      { id: 'empty', userId: 'u1' },
      { id: 'foreign', userId: 'u2', heatmapData: POINTS },
    ]);

    const byTour = await readTracksByTour({
      userId: 'u1',
      toursContainer: () => tours,
      tracksContainer: () => tracks,
    });

    expect(Object.fromEntries(byTour)).toEqual({
      new: { heatmapData: POINTS, segmentStarts: [2] },
      empty: ONE_LINE,
      old: { heatmapData: [[1, 2]], segmentStarts: [] },
    });
  });
});

describe('readTracksOfTours', () => {
  it("reads only the listed tours' tracks, moved or still inline, in the rider's partition", async () => {
    const tours = fakeToursContainer([
      { id: 'old', userId: 'u1', heatmapData: [[1, 2]] },
      { id: 'old-unlisted', userId: 'u1', heatmapData: [[5, 6]] },
      { id: 'other', userId: 'u2', heatmapData: [[3, 4]] },
    ]);
    const tracks = fakeTracksContainer([
      { id: 'new', userId: 'u1', heatmapData: POINTS, segmentStarts: [2] },
      { id: 'unlisted', userId: 'u1', heatmapData: POINTS },
      { id: 'other', userId: 'u2', heatmapData: POINTS },
    ]);

    const byTour = await readTracksOfTours({
      userId: 'u1',
      tourIds: ['new', 'old', 'other'],
      toursContainer: () => tours,
      tracksContainer: () => tracks,
    });

    expect(Object.fromEntries(byTour)).toEqual({
      new: { heatmapData: POINTS, segmentStarts: [2] },
      old: { heatmapData: [[1, 2]], segmentStarts: [] },
    });
    for (const container of [tours, tracks]) {
      const [query] = container.calls;
      expect(query.options.partitionKey).toBe('u1');
      expect(query.spec.parameters).toEqual([
        { name: '@userId', value: 'u1' },
        { name: '@tourIds', value: ['new', 'old', 'other'] },
      ]);
    }
  });
});
