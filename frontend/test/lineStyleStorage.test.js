import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadLineStyle, saveLineStyle } from '../src/ui/lineStyleStorage.js';
import { DEFAULT_LINE_STYLE, WEIGHT_MIN, OPACITY_MAX } from '../src/lib/lineStyle.js';

describe('loadLineStyle / saveLineStyle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips a style through localStorage', () => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    });
    const style = { color: '#123456', weight: WEIGHT_MIN, opacity: OPACITY_MAX };
    saveLineStyle(style);
    expect(loadLineStyle()).toEqual(style);
  });

  it('loads the default when nothing is stored', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(loadLineStyle()).toEqual(DEFAULT_LINE_STYLE);
  });
});
