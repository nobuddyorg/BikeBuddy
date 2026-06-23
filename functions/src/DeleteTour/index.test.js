'use strict';

const deleteTour = require('./index');

const TID = '11111111-1111-4111-8111-111111111111';
const TOUR = { id: TID, userId: 'u1', name: 'Alps' };

const mockAuth = async (ctx) => {
  ctx.userId = 'u1';
  return true;
};

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
const makeContext = () => ({ res: null, userId: 'u1' });

describe('DELETE /api/tours/{tourId}', () => {
  it('deletes blob + document and returns 204', async () => {
    const tours = makeToursContainer(async () => ({ resource: TOUR }));
    const gpx = makeGpxContainer();
    const ctx = makeContext();

    await deleteTour(
      ctx,
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => gpx.container,
    );

    expect(gpx.getBlockBlobClient).toHaveBeenCalledWith(`u1/${TID}.gpx`);
    expect(gpx.deleteIfExists).toHaveBeenCalled();
    expect(tours.item).toHaveBeenCalledWith(TID, 'u1'); // partition key = userId
    expect(tours.del).toHaveBeenCalled();
    expect(ctx.res.status).toBe(204);
  });

  it('returns 404 when the tour is not in the caller partition', async () => {
    const tours = makeToursContainer(async () => ({ resource: undefined }));
    const gpx = makeGpxContainer();
    const ctx = makeContext();

    await deleteTour(
      ctx,
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => gpx.container,
    );

    expect(ctx.res.status).toBe(404);
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
        makeContext(),
        reqWith(TID),
        mockAuth,
        () => tours.container,
        () => gpx.container,
      ),
    ).rejects.toThrow('boom');
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async (ctx) => {
      ctx.res = { status: 401, body: { error: 'Unauthorized' } };
      return false;
    };
    const tours = makeToursContainer(async () => ({ resource: TOUR }));
    const gpx = makeGpxContainer();
    const ctx = makeContext();

    await deleteTour(
      ctx,
      reqWith(TID),
      failAuth,
      () => tours.container,
      () => gpx.container,
    );

    expect(ctx.res.status).toBe(401);
    expect(tours.item).not.toHaveBeenCalled();
  });
});
