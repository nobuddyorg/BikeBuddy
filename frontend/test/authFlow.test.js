import { describe, it, expect } from 'vitest';
import { hasAuthResponse, needsSignIn, startupStep } from '../src/lib/authFlow.js';

const msalError = (errorCode) => Object.assign(new Error(errorCode), { errorCode });

describe('needsSignIn', () => {
  it.each([
    'interaction_required',
    'login_required',
    // A silent iframe that never answered: before, this left the page half signed in.
    'timed_out',
    'no_tokens_found',
  ])('asks for a sign-in after %s', (code) => {
    expect(needsSignIn(msalError(code))).toBe(true);
  });

  it.each(['no_network_connectivity', 'post_request_failed', 'get_request_failed'])(
    'treats %s as offline, not signed out',
    (code) => {
      expect(needsSignIn(msalError(code))).toBe(false);
    },
  );

  it('leaves errors that are not MSAL errors to surface as bugs', () => {
    expect(needsSignIn(new TypeError('x is undefined'))).toBe(false);
    expect(needsSignIn({ errorCode: 42 })).toBe(false);
    expect(needsSignIn(undefined)).toBe(false);
  });
});

describe('hasAuthResponse', () => {
  it('finds the answer in the fragment, where MSAL asks for it', () => {
    expect(hasAuthResponse({ search: '', hash: '#code=abc&state=xyz' })).toBe(true);
  });

  it('finds state as the first parameter, past the # or ?', () => {
    expect(hasAuthResponse({ search: '', hash: '#state=xyz&code=abc' })).toBe(true);
    expect(hasAuthResponse({ search: '?state=xyz&code=abc', hash: '' })).toBe(true);
  });

  it('finds the answer in the query', () => {
    expect(hasAuthResponse({ search: '?code=abc&state=xyz', hash: '' })).toBe(true);
  });

  it('finds an error answer, which carries state too', () => {
    expect(hasAuthResponse({ search: '', hash: '#error=login_required&state=xyz' })).toBe(true);
  });

  it("never mistakes the app's own URLs for one", () => {
    expect(hasAuthResponse({ search: '', hash: '' })).toBe(false);
    expect(
      hasAuthResponse({
        search: '?sort=date-desc&search=state',
        hash: '#/tour/abc',
      }),
    ).toBe(false);
    expect(hasAuthResponse({ search: '?q', hash: '#/tour/state' })).toBe(false);
  });
});

describe('startupStep', () => {
  const facts = {
    hasAccount: true,
    sessionUsable: true,
    wasSignedIn: true,
    silentSignInTried: false,
  };

  it('restores a session that still gives a token', () => {
    expect(startupStep(facts)).toBe('restore');
  });

  it('renews a lapsed session silently, once per tab', () => {
    expect(startupStep({ ...facts, sessionUsable: false })).toBe('silent-sign-in');
    expect(startupStep({ ...facts, sessionUsable: false, silentSignInTried: true })).toBe(
      'session-ended',
    );
  });

  it('renews silently after a browser restart dropped the cached account', () => {
    expect(startupStep({ ...facts, hasAccount: false, sessionUsable: false })).toBe(
      'silent-sign-in',
    );
    expect(
      startupStep({
        ...facts,
        hasAccount: false,
        sessionUsable: false,
        silentSignInTried: true,
      }),
    ).toBe('session-ended');
  });

  it('asks to sign in when a cached account lapsed without the signed-in flag', () => {
    expect(startupStep({ ...facts, sessionUsable: false, wasSignedIn: false })).toBe(
      'session-ended',
    );
  });

  it('stays signed out for someone who never signed in', () => {
    expect(
      startupStep({
        hasAccount: false,
        sessionUsable: false,
        wasSignedIn: false,
        silentSignInTried: false,
      }),
    ).toBe('signed-out');
    expect(
      startupStep({
        hasAccount: false,
        sessionUsable: false,
        wasSignedIn: false,
        silentSignInTried: true,
      }),
    ).toBe('signed-out');
  });

  it('never restores without an account, even if asked about its session', () => {
    expect(startupStep({ ...facts, hasAccount: false })).toBe('silent-sign-in');
  });
});
