import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from '../src/lib/concurrency.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

describe('runWithConcurrency', () => {
  it('never runs more than `limit` workers at once', async () => {
    const items = [1, 2, 3, 4, 5];
    let inFlight = 0;
    let maxInFlight = 0;
    const gates = items.map(() => deferred());

    const runPromise = runWithConcurrency(items, 2, async (item, index) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gates[index].promise;
      inFlight--;
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
    await runPromise;

    expect(maxInFlight).toBe(2);
  });

  it('processes every item exactly once', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const seen = [];
    await runWithConcurrency(items, 3, async (item) => {
      seen.push(item);
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it("one rejecting worker doesn't stop the others", async () => {
    const items = [1, 2, 3];
    const seen = [];
    await runWithConcurrency(items, 3, async (item) => {
      seen.push(item);
      if (item === 2) throw new Error('boom');
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it('handles an empty list', async () => {
    const worker = vi.fn();
    await runWithConcurrency([], 3, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});
