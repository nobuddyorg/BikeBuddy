// @ts-check

// Runs `worker` over every item, at most `limit` at a time. One item's
// failure does not stop the rest; like Promise.allSettled, the result reports
// each item's outcome in input order, so the caller decides what a failure
// means.
export async function runWithConcurrency({ items, limit, worker }) {
  const outcomes = new Array(items.length);
  let next = 0;

  async function runNext() {
    const index = next++;
    if (index >= items.length) return;
    try {
      outcomes[index] = {
        item: items[index],
        status: 'fulfilled',
        value: await worker(items[index], index),
      };
    } catch (reason) {
      outcomes[index] = { item: items[index], status: 'rejected', reason };
    }
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return outcomes;
}
