'use strict';

const {
  MAX_TOURS_PER_USER,
  MAX_STORED_BYTES_PER_USER,
  usageOf,
  quotaRefusal,
  refuseOverQuota,
} = require('./userQuota');
const { fakeToursContainer } = require('../../test/fakes/cosmosContainer');

const GIGABYTE = 1024 ** 3;

describe('usageOf', () => {
  it('counts the tours and sums every GPX and photo size', () => {
    expect(
      usageOf([
        { gpxBytes: 100, images: [{ bytes: 10 }, { bytes: 5 }] },
        { gpxBytes: 1, images: [] },
      ]),
    ).toEqual({ tourCount: 2, storedBytes: 116 });
  });

  it('counts sizes from before #549, or anything that is not a number, as nothing', () => {
    expect(
      usageOf([{ images: [{}, { bytes: '9' }] }, { gpxBytes: null }, { gpxBytes: 3 }]),
    ).toEqual({ tourCount: 3, storedBytes: 3 });
  });

  it('is empty for a rider without tours', () => {
    expect(usageOf([])).toEqual({ tourCount: 0, storedBytes: 0 });
  });
});

describe('quotaRefusal', () => {
  it(`allows up to ${MAX_TOURS_PER_USER} tours and 5 GB`, () => {
    expect(MAX_TOURS_PER_USER).toBe(1000);
    expect(MAX_STORED_BYTES_PER_USER).toBe(5 * GIGABYTE);
    const full = { tourCount: 999, storedBytes: 5 * GIGABYTE - 10 };

    expect(quotaRefusal(full, { tours: 1, bytes: 10 })).toBe('');
  });

  it('refuses the tour past the limit', () => {
    expect(quotaRefusal({ tourCount: 1000, storedBytes: 0 }, { tours: 1, bytes: 1 })).toBe(
      'errors.tourLimit',
    );
  });

  it('lets a photo onto a rider at the tour limit', () => {
    expect(quotaRefusal({ tourCount: 1000, storedBytes: 0 }, { tours: 0, bytes: 1 })).toBe('');
  });

  it('refuses a byte past the storage limit', () => {
    expect(
      quotaRefusal({ tourCount: 0, storedBytes: 5 * GIGABYTE - 10 }, { tours: 0, bytes: 11 }),
    ).toBe('errors.storageLimit');
  });

  it('names the tour limit first when both are passed', () => {
    expect(
      quotaRefusal({ tourCount: 1000, storedBytes: 5 * GIGABYTE }, { tours: 1, bytes: 1 }),
    ).toBe('errors.tourLimit');
  });
});

describe('refuseOverQuota', () => {
  const tour = (id, userId, gpxBytes) => ({ id, userId, gpxBytes, images: [] });

  it("reads only the caller's sizes, and carries on while the addition fits", async () => {
    const tours = fakeToursContainer([tour('t1', 'u1', 10), tour('t2', 'u2', 5 * GIGABYTE)]);

    const refused = await refuseOverQuota({
      userId: 'u1',
      toursContainer: () => tours,
      adding: { tours: 1, bytes: 5 * GIGABYTE - 10 },
    });

    expect(refused).toBeNull();
    const [query] = tours.calls;
    expect(query.options.partitionKey).toBe('u1');
    expect(query.spec.query).toBe('SELECT c.gpxBytes, c.images FROM c WHERE c.userId = @userId');
  });

  it('answers 400 with the refusal once the addition does not fit', async () => {
    const tours = fakeToursContainer([tour('t1', 'u1', 10)]);

    const refused = await refuseOverQuota({
      userId: 'u1',
      toursContainer: () => tours,
      adding: { tours: 0, bytes: 5 * GIGABYTE - 9 },
    });

    expect(refused).toEqual({ status: 400, jsonBody: { error: 'errors.storageLimit' } });
  });
});
