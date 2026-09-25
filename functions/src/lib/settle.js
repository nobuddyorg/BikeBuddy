// @ts-check
'use strict';

/**
 * Waits for every task, then throws if any failed, so no write is in flight after a failure.
 *
 * @template T
 * @param {Promise<T>[]} tasks
 * @param {string} failureMessage
 * @returns {Promise<T[]>}
 */
async function settleAll(tasks, failureMessage) {
  const results = await Promise.allSettled(tasks);
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length > 0) throw new AggregateError(failures, failureMessage);
  return results.map((result) => /** @type {PromiseFulfilledResult<T>} */ (result).value);
}

/**
 * On a failed write, rolls back and rethrows the write's error, or both when the rollback fails.
 *
 * @template T
 * @param {() => Promise<T>} write
 * @param {() => Promise<unknown>} rollback
 * @returns {Promise<T>}
 */
async function withRollback(write, rollback) {
  try {
    return await write();
  } catch (writeError) {
    try {
      await rollback();
    } catch (rollbackError) {
      const messages = [writeError, rollbackError].map(
        (failure) => /** @type {Error} */ (failure).message,
      );
      throw new AggregateError(
        [writeError, rollbackError],
        `${messages[0]}; the rollback failed as well: ${messages[1]}`,
        { cause: rollbackError },
      );
    }
    throw writeError;
  }
}

/**
 * Shares one run of `create` between callers; a rejection is dropped, so the next call retries.
 *
 * @template T
 * @param {() => Promise<T>} create
 * @returns {() => Promise<T>}
 */
function onceUntilFailure(create) {
  /** @type {Promise<T> | undefined} */
  let pending;
  return () => {
    pending ??= create().catch((error) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

module.exports = { settleAll, withRollback, onceUntilFailure };
