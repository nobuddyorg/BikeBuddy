'use strict';

// Runs `worker` over `items` with at most `limit` calls in flight at once.
// Each worker call's own success/failure is independent of the others — a
// rejecting worker is swallowed here so one bad item can't halt the batch;
// callers that need to know about failures report them through `worker`
// itself (e.g. by catching internally and recording the error on the item).
export async function runWithConcurrency(items, limit, worker) {
  let next = 0;

  async function runNext() {
    const i = next++;
    if (i >= items.length) return;
    try {
      await worker(items[i], i);
    } catch {
      // Intentionally swallowed: one item's failure must not stop the pool
      // or reject the overall runWithConcurrency() promise.
    }
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}
