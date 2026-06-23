'use strict';

const { deleteTour } = require('./index');

const TID = '11111111-1111-4111-8111-111111111111';
const TOUR = { id: TID, userId: 'u1', name: 'Alps' };

const mockAuth = async () => ({ userId: 'u1' });

function makeToursContainer(readImpl) {
  const read = vi.fn(readImpl);
  const del = vi.fn().mockResolvedValue({});
  const item = vi.fn().mockReturnValue({ read, delete: del });
  return { container: { item }, item, read, del };
}

function makeGpxContainer() {
  const deleteIfExists = vi.fn().mockResolvedValue({ succeeded: true });
  const getBlockBlobClient = vi.fn().mockReturnValue({ deleteIfExists });
  return { container: { getBlockBlobClient }, getBlockBlobClient, deleteIfExists };
}

const reqWith = (tourId) => ({ params: { tourId } });

describe('DELETE /api/tours/{tourId}', () => {
  it('deletes blob + document and returns 204', async () => {
    const tours = makeToursContainer(async () => ({ resource: TOUR }));
    const gpx = makeGpxContainer();
    const res = await deleteTour(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => gpx.container,
    );

    expect(gpx.getBlockBlobClient).toHaveBeenCalledWith(`u1/${TID}.gpx`);
    expect(gpx.deleteIfExists).toHaveBeenCalled();
    expect(tours.item).toHaveBeenCalledWith(TID, 'u1');
    expect(tours.del).toHaveBeenCalled();
    expect(res.status).toBe(204);
  });

  it('returns 400 when tourId is not a UUID', async () => {
    const tours = makeToursContainer(async () => ({ resource: TOUR }));
    const gpx = makeGpxContainer();
    const res = await deleteTour(
      reqWith('bad'),
      mockAuth,
      () => tours.container,
      () => gpx.container,
    );

    expect(res.status).toBe(400);
    expect(tours.item).not.toHaveBeenCalled();
  });

  it('returns 404 when the tour is not in the caller partition', async () => {
    const tours = makeToursContainer(async () => ({ resource: undefined }));
    const gpx = makeGpxContainer();
    const res = await deleteTour(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => gpx.container,
    );

    expect(res.status).toBe(404);
    expect(gpx.deleteIfExists).not.toHaveBeenCalled();
    expect(tours.del).not.toHaveBeenCalled();
  });

  it('re-throws non-404 read errors', async () => {
    const tours = makeToursContainer(async () => {
      throw Object.assign(new Error('boom'), { code: 503 });
    });
    const gpx = makeGpxContainer();
    await expect(
      deleteTour(
        reqWith(TID),
        mockAuth,
        () => tours.container,
        () => gpx.container,
      ),
    ).rejects.toThrow('boom');
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async () => null;
    const tours = makeToursContainer(async () => ({ resource: TOUR }));
    const gpx = makeGpxContainer();
    const res = await deleteTour(
      reqWith(TID),
      failAuth,
      () => tours.container,
      () => gpx.container,
    );

    expect(res.status).toBe(401);
    expect(tours.item).not.toHaveBeenCalled();
  });
});
