'use strict';

const {
  toTourResponse,
  toTourDetailResponse,
  toCreatedTourResponse,
  gpxDownloadDisposition,
} = require('./tourResponse');

const STORED = {
  id: 't1',
  userId: 'entra-subject-id',
  name: 'Alps',
  description: 'Nice ride',
  distance: 120,
  createdAt: '2026-01-01T00:00:00.000Z',
  heatmapData: [[48.1, 11.5]],
  images: [{ id: 'img1', blobName: 'entra-subject-id/t1/img1.jpg' }],
  gpxFileUrl: 'https://account.blob.core.windows.net/gpx-files/entra-subject-id/t1.gpx',
  elevationGain: 340,
  elevationLoss: 310,
  minElevation: 420,
  maxElevation: 890,
  durationSeconds: 7200,
  movingSeconds: 6300,
  avgSpeed: 21.5,
  _rid: 'abc==',
  _self: 'dbs/abc/colls/def/docs/ghi/',
  _etag: '"0000-1111"',
  _attachments: 'attachments/',
  _ts: 1767225600,
};

const STATS = {
  elevationGain: 340,
  elevationLoss: 310,
  minElevation: 420,
  maxElevation: 890,
  durationSeconds: 7200,
  movingSeconds: 6300,
  avgSpeed: 21.5,
};

describe('toTourResponse', () => {
  it('returns the tour fields the client needs and nothing that names storage', () => {
    expect(toTourResponse(STORED)).toStrictEqual({
      id: 't1',
      name: 'Alps',
      description: 'Nice ride',
      distance: 120,
      createdAt: '2026-01-01T00:00:00.000Z',
      heatmapData: [[48.1, 11.5]],
      ...STATS,
    });
  });

  it('reports the stat fields as null for a tour uploaded before they existed', () => {
    const beforeStats = Object.fromEntries(
      Object.entries(STORED).filter(([key]) => !(key in STATS)),
    );

    const body = toTourResponse(beforeStats);
    for (const field of Object.keys(STATS)) expect(body[field]).toBeNull();
  });

  it('keeps a stat of zero rather than turning it into null', () => {
    expect(toTourResponse({ ...STORED, elevationGain: 0 }).elevationGain).toBe(0);
  });

  it('answers an empty track for a document without heatmapData', () => {
    expect(toTourResponse({ ...STORED, heatmapData: undefined }).heatmapData).toEqual([]);
  });

  it.each([
    [20240512, '20240512'],
    [{ '#text': 'x' }, 'Untitled Tour'],
    [null, 'Untitled Tour'],
    ['', 'Untitled Tour'],
  ])('answers a text name for the stored name %j, as uploads before #548 wrote', (name, text) => {
    expect(toTourResponse({ ...STORED, name }).name).toBe(text);
  });

  it('ignores fields it does not know about', () => {
    expect(toTourResponse({ ...STORED, internalNote: 'secret' })).not.toHaveProperty(
      'internalNote',
    );
  });
});

describe('toTourDetailResponse', () => {
  const images = [{ id: 'img1', url: 'https://signed/full', thumbUrl: 'https://signed/thumb' }];

  it('adds the signed images and download URL, never the stored ones', () => {
    const body = toTourDetailResponse({ tour: STORED, images, gpxFileUrl: 'https://signed/gpx' });

    expect(body).toStrictEqual({
      ...toTourResponse(STORED),
      images,
      gpxFileUrl: 'https://signed/gpx',
    });
    expect(JSON.stringify(body)).not.toContain('entra-subject-id');
  });

  it('leaves gpxFileUrl out when there is nothing to download', () => {
    expect(toTourDetailResponse({ tour: STORED, images: [] })).not.toHaveProperty('gpxFileUrl');
  });
});

describe('toCreatedTourResponse', () => {
  it('returns the new tour id under tourId, and no storage URL', () => {
    expect(toCreatedTourResponse(STORED)).toStrictEqual({
      tourId: 't1',
      name: 'Alps',
      distance: 120,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('gpxDownloadDisposition', () => {
  it('names the download after the tour', () => {
    expect(gpxDownloadDisposition('Alps')).toBe('attachment; filename="Alps.gpx"');
  });

  it('collapses each run of disallowed filename characters to one underscore', () => {
    expect(gpxDownloadDisposition('My  Alps!!')).toBe('attachment; filename="My_Alps_.gpx"');
  });

  it('keeps letters, digits, dashes and underscores', () => {
    expect(gpxDownloadDisposition('Tour-2026_b')).toBe('attachment; filename="Tour-2026_b.gpx"');
  });

  it('falls back to "tour" for a tour without a name', () => {
    expect(gpxDownloadDisposition(undefined)).toBe('attachment; filename="tour.gpx"');
    expect(gpxDownloadDisposition('')).toBe('attachment; filename="tour.gpx"');
    expect(gpxDownloadDisposition({ '#text': 'x' })).toBe('attachment; filename="tour.gpx"');
  });

  it('names the download after a numeric name stored before #548', () => {
    expect(gpxDownloadDisposition(20240512)).toBe('attachment; filename="20240512.gpx"');
  });

  it('keeps non-ASCII letters in filename*, with an accent-free ASCII fallback', () => {
    expect(gpxDownloadDisposition('Größe Runde')).toBe(
      `attachment; filename="Gro_e_Runde.gpx"; filename*=UTF-8''Gr%C3%B6%C3%9Fe_Runde.gpx`,
    );
    expect(gpxDownloadDisposition('Château Étape')).toBe(
      `attachment; filename="Chateau_Etape.gpx"; filename*=UTF-8''Ch%C3%A2teau_%C3%89tape.gpx`,
    );
  });

  it('collapses a run of letters without an ASCII form into one underscore', () => {
    expect(gpxDownloadDisposition('Tokyo 東京')).toBe(
      `attachment; filename="Tokyo__.gpx"; filename*=UTF-8''Tokyo_%E6%9D%B1%E4%BA%AC.gpx`,
    );
  });

  it('falls back to "tour" when no ASCII letter is left, keeping the name in filename*', () => {
    expect(gpxDownloadDisposition('Москва')).toBe(
      `attachment; filename="tour.gpx"; filename*=UTF-8''%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0.gpx`,
    );
  });

  it('never lets a quote, semicolon or apostrophe into either filename', () => {
    const disposition = gpxDownloadDisposition(`Tür"; filename="x'.exe`);
    expect(disposition).toBe(
      `attachment; filename="Tur_filename_x_exe.gpx"; filename*=UTF-8''T%C3%BCr_filename_x_exe.gpx`,
    );
  });
});
