import { describe, it, expect } from 'vitest';
import { heatScaleForZoom, heatOptionsForZoom } from '../src/lib/heatmapZoom.js';

describe('heatScaleForZoom', () => {
  it('is 1 at and below the reference zoom', () => {
    expect(heatScaleForZoom(6)).toBe(1);
    expect(heatScaleForZoom(14)).toBe(1);
  });

  it('grows above the reference zoom', () => {
    expect(heatScaleForZoom(16)).toBe(2);
    expect(heatScaleForZoom(18)).toBe(4);
  });

  it('caps out instead of growing unbounded', () => {
    expect(heatScaleForZoom(19)).toBe(4);
    expect(heatScaleForZoom(24)).toBe(4);
  });
});

describe('heatOptionsForZoom', () => {
  const base = { radius: 16, blur: 20, minOpacity: 0.45 };

  it('leaves the base options untouched at low zoom', () => {
    expect(heatOptionsForZoom(10, base)).toEqual(base);
  });

  it('scales radius and blur while preserving other options', () => {
    expect(heatOptionsForZoom(16, base)).toEqual({ radius: 32, blur: 40, minOpacity: 0.45 });
  });

  it('does not mutate the base options object', () => {
    heatOptionsForZoom(18, base);
    expect(base).toEqual({ radius: 16, blur: 20, minOpacity: 0.45 });
  });
});
