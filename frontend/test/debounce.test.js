'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../src/lib/debounce.js';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses a burst of calls into one, after the delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes through the arguments of the last call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced('first');
    debounced('second');
    vi.advanceTimersByTime(200);

    expect(fn).toHaveBeenCalledWith('second');
  });

  it('restarts the delay on each call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    vi.advanceTimersByTime(150);
    debounced();
    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
