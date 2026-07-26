'use strict';

// A rejecting worker is swallowed so one bad item can't halt the batch; callers
// that care report failures through `worker` itself.
export async function runWithConcurrency(items, limit, worker) {
  let next = 0;

  async function runNext() {
    const i = next++;
    if (i >= items.length) return;
    try {
      await worker(items[i], i);
    } catch {
      // See above: one item's failure must not stop the pool.
    }
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}
