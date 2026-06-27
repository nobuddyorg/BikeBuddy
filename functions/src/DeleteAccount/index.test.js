'use strict';

const { deleteAccount } = require('./index');

const UID = 'u1';
const mockAuth = async () => ({ userId: UID });

function asyncList(names) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const name of names) yield { name };
    },
  };
}

function makeTours(ids = ['t1', 't2']) {
  const del = vi.fn().mockResolvedValue({});
  const item = vi.fn().mockReturnValue({ delete: del });
  const fetchAll = vi.fn().mockResolvedValue({ resources: ids.map((id) => ({ id })) });
  const query = vi.fn().mockReturnValue({ fetchAll });
  return { container: { items: { query }, item }, item, del, query };
}

function makeUsers(exists = true) {
  const del = vi.fn().mockResolvedValue({});
  const item = vi.fn().mockReturnValue({
    read: async () => ({ resource: exists ? { id: UID } : undefined }),
    delete: del,
  });
  return { container: { item }, item, del };
}

function makeBlobs(names) {
  const deleteBlob = vi.fn().mockResolvedValue({});
  const listBlobsFlat = vi.fn(() => asyncList(names));
  return { container: { listBlobsFlat, deleteBlob }, deleteBlob, listBlobsFlat };
}

describe('DELETE /api/me', () => {
  it('returns 401 when auth fails', async () => {
    const res = await deleteAccount({}, async () => null);
    expect(res.status).toBe(401);
  });

  it('cascades: deletes tours, prefixed blobs, and the user doc', async () => {
    const tours = makeTours(['t1', 't2']);
    const users = makeUsers(true);
    const gpx = makeBlobs([`${UID}/a.gpx`]);
    const images = makeBlobs([`${UID}/t1/p.jpg`, `${UID}/t1/q.jpg`]);

    const res = await deleteAccount(
      {},
      mockAuth,
      () => users.container,
      () => tours.container,
      async () => gpx.container,
      async () => images.container,
    );

    expect(res.status).toBe(204);
    expect(tours.del).toHaveBeenCalledTimes(2);
    expect(tours.item).toHaveBeenCalledWith('t1', UID);
    expect(gpx.listBlobsFlat).toHaveBeenCalledWith({ prefix: `${UID}/` });
    expect(gpx.deleteBlob).toHaveBeenCalledWith(`${UID}/a.gpx`);
    expect(images.deleteBlob).toHaveBeenCalledTimes(2);
    expect(users.del).toHaveBeenCalledTimes(1);
  });

  it('skips the user delete when the doc is already gone', async () => {
    const users = makeUsers(false);
    const res = await deleteAccount(
      {},
      mockAuth,
      () => users.container,
      () => makeTours([]).container,
      async () => makeBlobs([]).container,
      async () => makeBlobs([]).container,
    );

    expect(res.status).toBe(204);
    expect(users.del).not.toHaveBeenCalled();
  });
});
