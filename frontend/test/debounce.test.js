import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../src/lib/debounce.js';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses a burst of calls into one, after the delay', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 200);

    debounced();
    debounced();
    debounced();
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('passes through the arguments of the last call', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 200);

    debounced('first');
    debounced('second');
    vi.advanceTimersByTime(200);

    expect(callback).toHaveBeenCalledWith('second');
  });

  it('restarts the delay on each call', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 200);

    debounced();
    vi.advanceTimersByTime(150);
    debounced();
    vi.advanceTimersByTime(150);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
