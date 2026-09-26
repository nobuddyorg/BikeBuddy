import { describe, it, expect } from 'vitest';
import { resolveAuthConfig, userFromAccount, userFromAuthResult } from '../src/lib/authConfig.js';

const tenant = {
  apiBaseUrl: 'https://api.example.net',
  entraSubdomain: 'bikebuddy',
  entraClientId: 'client-id',
  entraApiScope: 'api://client-id/access_as_user',
  devMode: false,
};

describe('resolveAuthConfig', () => {
  it('signs in through the configured Entra tenant', () => {
    expect(resolveAuthConfig(tenant)).toEqual({
      apiBase: 'https://api.example.net',
      useDevAuth: false,
      clientId: 'client-id',
      authority: 'https://bikebuddy.ciamlogin.com/',
      knownAuthorities: ['bikebuddy.ciamlogin.com'],
      loginScopes: ['openid', 'profile', 'api://client-id/access_as_user'],
    });
  });

  it('falls back to dev auth when the tenant is incomplete or devMode is set', () => {
    expect(resolveAuthConfig({ ...tenant, entraSubdomain: '' }).useDevAuth).toBe(true);
    expect(resolveAuthConfig({ ...tenant, entraClientId: undefined }).useDevAuth).toBe(true);
    expect(resolveAuthConfig({ ...tenant, devMode: true }).useDevAuth).toBe(true);
  });

  it('defaults to a same-origin API and the base scopes', () => {
    expect(resolveAuthConfig({})).toMatchObject({
      apiBase: '',
      useDevAuth: true,
      clientId: '',
      loginScopes: ['openid', 'profile'],
    });
  });
});

describe('userFromAccount', () => {
  it('takes the id and the signed-in address', () => {
    expect(userFromAccount({ homeAccountId: 'h1', username: 'ada@example.com' })).toEqual({
      id: 'h1',
      email: 'ada@example.com',
    });
    expect(userFromAccount({ homeAccountId: 'h1' })).toEqual({ id: 'h1', email: '' });
  });
});

describe('userFromAuthResult', () => {
  const account = { homeAccountId: 'h1', username: 'account@example.com' };

  it('prefers the email claim, then preferred_username, then the account name', () => {
    const claims = { email: 'mail@example.com', preferred_username: 'pref@example.com' };
    expect(userFromAuthResult({ account, idTokenClaims: claims })).toEqual({
      id: 'h1',
      email: 'mail@example.com',
    });
    expect(
      userFromAuthResult({ account, idTokenClaims: { preferred_username: 'pref@example.com' } })
        .email,
    ).toBe('pref@example.com');
    expect(userFromAuthResult({ account }).email).toBe('account@example.com');
  });
});
