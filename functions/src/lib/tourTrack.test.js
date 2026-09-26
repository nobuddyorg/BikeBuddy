'use strict';

const { newTrackDocument, readTourPoints, readPointsByTour } = require('./tourTrack');
const { fakeToursContainer, fakeTracksContainer } = require('../../test/fakes/cosmosContainer');

const POINTS = [
  [48.1, 11.5],
  [48.2, 11.6],
];

describe('newTrackDocument', () => {
  it("files the points under the tour's id in the rider's partition, versioned", () => {
    expect(newTrackDocument({ tourId: 't1', userId: 'u1', heatmapData: POINTS })).toStrictEqual({
      id: 't1',
      userId: 'u1',
      schemaVersion: 1,
      heatmapData: POINTS,
    });
  });
});

describe('readTourPoints', () => {
  const read = (tour, tracks) =>
    readTourPoints({ tour, userId: 'u1', tracksContainer: () => fakeTracksContainer(tracks) });

  it("reads the track item under the tour's id", async () => {
    expect(await read({ id: 't1' }, [{ id: 't1', userId: 'u1', heatmapData: POINTS }])).toEqual(
      POINTS,
    );
  });

  it("never reads another rider's track under the same id", async () => {
    expect(await read({ id: 't1' }, [{ id: 't1', userId: 'u2', heatmapData: POINTS }])).toEqual([]);
  });

  it('answers no points for a missing track or one without points', async () => {
    expect(await read({ id: 't1' }, [])).toEqual([]);
    expect(await read({ id: 't1' }, [{ id: 't1', userId: 'u1' }])).toEqual([]);
  });

  it('answers the points a tour from before #615 holds itself', async () => {
    expect(await read({ id: 't1', heatmapData: [[1, 2]] }, [])).toEqual([[1, 2]]);
  });
});

describe('readPointsByTour', () => {
  it('maps every tour id of the rider to its points, moved or still inline', async () => {
    const tours = fakeToursContainer([
      { id: 'old', userId: 'u1', heatmapData: [[1, 2]] },
      { id: 'new', userId: 'u1', pointCount: 2 },
      { id: 'other', userId: 'u2', heatmapData: [[3, 4]] },
    ]);
    const tracks = fakeTracksContainer([
      { id: 'new', userId: 'u1', heatmapData: POINTS },
      { id: 'empty', userId: 'u1' },
      { id: 'foreign', userId: 'u2', heatmapData: POINTS },
    ]);

    const points = await readPointsByTour({
      userId: 'u1',
      toursContainer: () => tours,
      tracksContainer: () => tracks,
    });

    expect(Object.fromEntries(points)).toEqual({ new: POINTS, empty: [], old: [[1, 2]] });
  });
});
