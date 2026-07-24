import { describe, it, expect } from 'vitest';
import { heatScaleForZoom, heatOptionsForZoom } from '../src/lib/heatmapZoom.js';

describe('heatScaleForZoom', () => {
  it('is 1 at and below the reference zoom', () => {
    expect(heatScaleForZoom(6)).toBe(1);
    expect(heatScaleForZoom(14)).toBe(1);
  });

  it('grows above the reference zoom', () => {
    expect(heatScaleForZoom(15)).toBeCloseTo(1.587, 3);
    expect(heatScaleForZoom(16)).toBeCloseTo(2.52, 2);
  });

  it('caps out instead of growing unbounded', () => {
    expect(heatScaleForZoom(17)).toBe(3);
    expect(heatScaleForZoom(24)).toBe(3);
  });
});

describe('heatOptionsForZoom', () => {
  const base = { radius: 16, blur: 20, minOpacity: 0.45 };

  it('leaves the base options untouched at low zoom', () => {
    expect(heatOptionsForZoom(10, base)).toEqual(base);
  });

  it('scales radius and blur while preserving other options, blur growing faster', () => {
    expect(heatOptionsForZoom(17, base)).toEqual({ radius: 48, blur: 100, minOpacity: 0.45 });
  });

  it('does not mutate the base options object', () => {
    heatOptionsForZoom(18, base);
    expect(base).toEqual({ radius: 16, blur: 20, minOpacity: 0.45 });
  });
});
