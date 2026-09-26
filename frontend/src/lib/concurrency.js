// @ts-check

// Like Promise.allSettled over `worker(item)`, with at most `limit` running at once.
export async function runWithConcurrency({ items, limit, worker }) {
  const outcomes = [];
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
