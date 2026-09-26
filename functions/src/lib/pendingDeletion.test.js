'use strict';

const { refusePendingDeletion } = require('./pendingDeletion');
const { fakeUsersContainer } = require('../../test/fakes/cosmosContainer');

const QUEUED = { id: 'oid-1', userId: 'u1', requestedAt: '2026-03-01T12:00:00.000Z' };

describe('refusePendingDeletion', () => {
  it('answers 410 for a caller whose deletion is queued', async () => {
    const deletions = fakeUsersContainer([QUEUED]);

    const response = await refusePendingDeletion({ userOid: 'oid-1' }, () => deletions);

    expect(response).toEqual({ status: 410, jsonBody: { error: 'errors.accountDeleted' } });
    expect(deletions.calls).toEqual([{ operation: 'read', id: 'oid-1', partitionKey: 'oid-1' }]);
  });

  it('lets any other caller through', async () => {
    const deletions = fakeUsersContainer([QUEUED]);

    expect(await refusePendingDeletion({ userOid: 'oid-2' }, () => deletions)).toBeNull();
  });

  it('reads nothing for a caller without an Entra object id', async () => {
    const deletionsContainer = vi.fn();

    expect(await refusePendingDeletion({ userOid: null }, deletionsContainer)).toBeNull();
    expect(deletionsContainer).not.toHaveBeenCalled();
  });
});
