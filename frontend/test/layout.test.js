import { describe, it, expect } from 'vitest';
import { centeredLeft, initialFocusIndex, mapExpandTransition } from '../src/lib/layout.js';

describe('centeredLeft', () => {
  it('centres the element on its container', () => {
    expect(
      centeredLeft({ containerLeft: 100, containerWidth: 400, elementWidth: 200, minimumLeft: 16 }),
    ).toBe(200);
  });

  it('never goes past the minimum', () => {
    expect(
      centeredLeft({ containerLeft: 0, containerWidth: 200, elementWidth: 300, minimumLeft: 16 }),
    ).toBe(16);
  });
});

describe('initialFocusIndex', () => {
  it('skips the close button when there is another control', () => {
    expect(initialFocusIndex(3)).toBe(1);
    expect(initialFocusIndex(2)).toBe(1);
  });

  it('takes the only control, or the dialog itself', () => {
    expect(initialFocusIndex(1)).toBe(0);
    expect(initialFocusIndex(0)).toBe(0);
  });
});

describe('mapExpandTransition', () => {
  it('remembers whether the map came from the tour preview, and hides the map button', () => {
    expect(
      mapExpandTransition({ expanded: true, wasInDetail: true, expandedFromDetail: false }),
    ).toEqual({ expandedFromDetail: true, returnToDetail: false, showFab: false });
    expect(
      mapExpandTransition({ expanded: true, wasInDetail: false, expandedFromDetail: true }),
    ).toEqual({ expandedFromDetail: false, returnToDetail: false, showFab: false });
  });

  it('collapses back into the tour preview it came from', () => {
    expect(
      mapExpandTransition({ expanded: false, wasInDetail: false, expandedFromDetail: true }),
    ).toEqual({ expandedFromDetail: false, returnToDetail: true, showFab: false });
  });

  it('collapses back to the list, showing the map button', () => {
    expect(
      mapExpandTransition({ expanded: false, wasInDetail: false, expandedFromDetail: false }),
    ).toEqual({ expandedFromDetail: false, returnToDetail: false, showFab: true });
  });
});
