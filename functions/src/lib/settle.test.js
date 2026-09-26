'use strict';

const { settleAll, settleAllLimited, withRollback, onceUntilFailure } = require('./settle');

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

describe('settleAllLimited', () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((settle) => {
      resolve = settle;
    });
    return { promise, resolve };
  };

  it('resolves every value in task order, however they finish', async () => {
    const slow = deferred();
    const running = settleAllLimited([() => slow.promise, async () => 2, async () => 3], {
      limit: 2,
      failureMessage: 'failed',
    });
    slow.resolve(1);

    await expect(running).resolves.toEqual([1, 2, 3]);
  });

  it('never runs more than the limit at once, and starts the next as one finishes', async () => {
    const gates = [deferred(), deferred(), deferred()];
    const started = [];
    const tasks = gates.map((gate, index) => () => {
      started.push(index);
      return gate.promise;
    });

    const running = settleAllLimited(tasks, { limit: 2, failureMessage: 'failed' });
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    gates[0].resolve('a');
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    gates[1].resolve('b');
    gates[2].resolve('c');
    await expect(running).resolves.toEqual(['a', 'b', 'c']);
  });

  it('runs every task after a failure, then reports each failure, a thrown one included', async () => {
    const first = new Error('first');
    const second = new Error('second');
    const ran = vi.fn(async () => 'ok');

    const error = await settleAllLimited(
      [
        async () => {
          throw first;
        },
        () => {
          throw second;
        },
        ran,
      ],
      { limit: 1, failureMessage: 'some deletes failed' },
    ).catch((failure) => failure);

    expect(ran).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toBe('some deletes failed');
    expect(error.errors).toEqual([first, second]);
  });

  it('resolves an empty list without running anything', async () => {
    await expect(settleAllLimited([], { limit: 4, failureMessage: 'failed' })).resolves.toEqual([]);
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

describe('onceUntilFailure', () => {
  it('runs once and hands every caller the same result', async () => {
    const create = vi.fn(async () => ({ name: 'gpx-files' }));
    const container = onceUntilFailure(create);

    const [first, second] = await Promise.all([container(), container()]);
    const third = await container();

    expect(create).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('shares a failure between the callers waiting on it', async () => {
    const create = vi.fn(async () => {
      throw new Error('storage blip');
    });
    const container = onceUntilFailure(create);

    const results = await Promise.allSettled([container(), container()]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
  });

  it('tries again after a failure instead of keeping it (#555)', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage blip'))
      .mockResolvedValue('container');
    const container = onceUntilFailure(create);

    await expect(container()).rejects.toThrow('storage blip');
    await expect(container()).resolves.toBe('container');
    await expect(container()).resolves.toBe('container');
    expect(create).toHaveBeenCalledTimes(2);
  });
});
