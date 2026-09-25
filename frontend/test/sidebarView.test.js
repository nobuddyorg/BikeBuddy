import { describe, it, expect } from 'vitest';
import { sidebarViewState } from '../src/lib/sidebarView.js';

const base = { signedIn: true, loadingTours: false, toursLoadFailed: false, tourCount: 3 };

describe('sidebarViewState', () => {
  it('shows nothing but the sign-in prompt when signed out', () => {
    expect(
      sidebarViewState({
        signedIn: false,
        loadingTours: true,
        toursLoadFailed: true,
        tourCount: 3,
      }),
    ).toEqual({ signedIn: false, loading: false, failed: false, empty: false, hasTours: false });
  });

  it('shows only the spinner while loading, even after an earlier failure', () => {
    expect(sidebarViewState({ ...base, loadingTours: true, toursLoadFailed: true })).toEqual({
      signedIn: true,
      loading: true,
      failed: false,
      empty: false,
      hasTours: false,
    });
  });

  it('shows only the error after a failed load', () => {
    expect(sidebarViewState({ ...base, toursLoadFailed: true })).toEqual({
      signedIn: true,
      loading: false,
      failed: true,
      empty: false,
      hasTours: false,
    });
  });

  it('tells an empty account from one with tours', () => {
    expect(sidebarViewState({ ...base, tourCount: 0 })).toMatchObject({
      empty: true,
      hasTours: false,
    });
    expect(sidebarViewState(base)).toMatchObject({ empty: false, hasTours: true });
  });
});
