'use strict';

const { STORED_STAT_FIELDS, storedTrackStats } = require('./tourStats');

describe('storedTrackStats', () => {
  it('maps every parsed stat onto its stored field', () => {
    const track = {
      distanceKm: 12.5,
      elevationGain: 300,
      elevationLoss: 280,
      minElevation: 500,
      maxElevation: 800,
      durationSeconds: 3600,
      movingSeconds: 3000,
      avgSpeed: 15,
      heatmapData: [[48, 11]],
      name: 'Not a stat',
    };

    expect(storedTrackStats(track)).toStrictEqual({
      distance: 12.5,
      elevationGain: 300,
      elevationLoss: 280,
      minElevation: 500,
      maxElevation: 800,
      durationSeconds: 3600,
      movingSeconds: 3000,
      avgSpeed: 15,
    });
  });

  it('names the stored fields in document order', () => {
    expect(STORED_STAT_FIELDS).toEqual([
      'distance',
      'elevationGain',
      'elevationLoss',
      'minElevation',
      'maxElevation',
      'durationSeconds',
      'movingSeconds',
      'avgSpeed',
    ]);
  });
});
