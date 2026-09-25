'use strict';

const { settleAll, withRollback } = require('./settle');

describe('settleAll', () => {
  it('resolves every value in order when all tasks succeed', async () => {
    await expect(settleAll([Promise.resolve(1), Promise.resolve(2)], 'failed')).resolves.toEqual([
      1, 2,
    ]);
  });

  it('waits for the slower tasks before reporting every failure', async () => {
    const finished = [];
    const slow = new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
      finished.push('slow'),
    );
    const first = new Error('first');
    const second = new Error('second');

    const error = await settleAll(
      [Promise.reject(first), slow, Promise.reject(second)],
      'some deletes failed',
    ).catch((failure) => failure);

    expect(finished).toEqual(['slow']);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toBe('some deletes failed');
    expect(error.errors).toEqual([first, second]);
  });
});

describe('withRollback', () => {
  it('returns the write result and never rolls back on success', async () => {
    const rollback = vi.fn();
    await expect(withRollback(async () => 'written', rollback)).resolves.toBe('written');
    expect(rollback).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows the write error', async () => {
    const writeError = new Error('cosmos down');
    const rollback = vi.fn(async () => {});

    await expect(
      withRollback(async () => {
        throw writeError;
      }, rollback),
    ).rejects.toBe(writeError);
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it('surfaces both errors when the rollback fails too', async () => {
    const writeError = new Error('cosmos down');
    const rollbackError = new Error('storage down');

    const error = await withRollback(
      async () => {
        throw writeError;
      },
      async () => {
        throw rollbackError;
      },
    ).catch((failure) => failure);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([writeError, rollbackError]);
    expect(error.cause).toBe(rollbackError);
    expect(error.message).toBe('cosmos down; the rollback failed as well: storage down');
  });
});
