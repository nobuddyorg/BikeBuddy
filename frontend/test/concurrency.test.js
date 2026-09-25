import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from '../src/lib/concurrency.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => (resolve = resolvePromise));
  return { promise, resolve };
}

describe('runWithConcurrency', () => {
  it('never runs more than `limit` workers at once', async () => {
    const items = [1, 2, 3, 4, 5];
    let inFlight = 0;
    let maxInFlight = 0;
    const gates = items.map(() => deferred());

    const running = runWithConcurrency({
      items,
      limit: 2,
      worker: async (item, index) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await gates[index].promise;
        inFlight--;
      },
    });

    // Let the first batch start.
    await Promise.resolve();
    await Promise.resolve();
    expect(inFlight).toBe(2);

    // Release all gates in order; each release lets the next queued item start.
    for (const gate of gates) {
      gate.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
    await running;

    expect(maxInFlight).toBe(2);
  });

  it('processes every item exactly once', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const seen = [];
    await runWithConcurrency({
      items,
      limit: 3,
      worker: async (item) => {
        seen.push(item);
      },
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it("one rejecting worker doesn't stop the others", async () => {
    const items = [1, 2, 3];
    const seen = [];
    await runWithConcurrency({
      items,
      limit: 1,
      worker: async (item) => {
        seen.push(item);
        if (item === 2) throw new Error('boom');
      },
    });
    expect(seen).toEqual(items);
  });

  it('reports every outcome in input order, failures included', async () => {
    const failure = new Error('boom');
    const outcomes = await runWithConcurrency({
      items: ['a', 'b', 'c'],
      limit: 2,
      worker: async (item, index) => {
        if (item === 'b') throw failure;
        return `${item}${index}`;
      },
    });
    expect(outcomes).toEqual([
      { item: 'a', status: 'fulfilled', value: 'a0' },
      { item: 'b', status: 'rejected', reason: failure },
      { item: 'c', status: 'fulfilled', value: 'c2' },
    ]);
  });

  it('handles an empty list', async () => {
    const worker = vi.fn();
    expect(await runWithConcurrency({ items: [], limit: 3, worker })).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });
});
