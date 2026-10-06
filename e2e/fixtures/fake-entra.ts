// A stand-in for the Entra External ID tenant, so the vendored MSAL runs its real redirect, bridge
// and silent-renewal flows in the browser. No CI job can sign in to the real tenant (#564).
import type { Page, Request, Route } from '@playwright/test';

const SUBDOMAIN = 'bikebuddy-e2e';
const ORIGIN = `https://${SUBDOMAIN}.ciamlogin.com`;
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_OID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

const ENDPOINTS = {
  authorize: `${ORIGIN}/${TENANT_ID}/oauth2/v2.0/authorize`,
  token: `${ORIGIN}/${TENANT_ID}/oauth2/v2.0/token`,
  logout: `${ORIGIN}/${TENANT_ID}/oauth2/v2.0/logout`,
};

// What config.js holds in production, pointed at the fake tenant.
const ENTRA_CONFIG_JS = `'use strict';\nwindow.BIKEBUDDY_CONFIG = ${JSON.stringify({
  apiBaseUrl: '',
  entraSubdomain: SUBDOMAIN,
  entraClientId: CLIENT_ID,
  entraApiScope: `api://${CLIENT_ID}/access_as_user`,
  devMode: false,
})};\n`;

interface AuthorizeVisit {
  prompt: string | null;
  /** The hidden iframe of a silent renewal, rather than the whole tab. */
  inIframe: boolean;
}

export interface FakeEntra {
  /**
   * Entra's own sign-in cookie. `hidden-from-iframes` plays Firefox, whose Total Cookie Protection
   * keeps it from the hidden iframe; a top-level visit still sees it.
   */
  session: 'alive' | 'hidden-from-iframes' | 'ended';
  /** Entra caps a SPA's refresh token at 24 hours; `expired` answers it with AADSTS700084. */
  refreshTokens: 'valid' | 'expired';
  authorizeVisits: AuthorizeVisit[];
  logoutVisits: number;
}

const base64Url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

const CLIENT_INFO = base64Url({ uid: USER_OID, utid: TENANT_ID });

function idToken(nonce: string) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: CLIENT_ID,
    iss: `${ORIGIN}/${TENANT_ID}/v2.0`,
    iat: now,
    nbf: now,
    exp: now + 3600,
    sub: 'rider-subject',
    oid: USER_OID,
    tid: TENANT_ID,
    nonce,
    name: 'Rider',
    preferred_username: 'rider@example.com',
  };
  // MSAL reads the claims; the signature is the API's to check, and these tokens never reach one.
  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url(claims)}.`;
}

// MSAL calls the token endpoint cross-origin, as a CORS request.
const CORS = { 'access-control-allow-origin': '*' };

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    headers: CORS,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

const redirectTo = (route: Route, location: string) =>
  route.fulfill({ status: 302, headers: { location } });

const isInIframe = (request: Request) => request.frame().parentFrame() !== null;

export async function fakeEntra(page: Page): Promise<FakeEntra> {
  const entra: FakeEntra = {
    session: 'alive',
    refreshTokens: 'valid',
    authorizeVisits: [],
    logoutVisits: 0,
  };
  // The nonce of the last authorize visit, which its code's id token must carry back.
  let pendingNonce = '';

  const metadata = (route: Route) =>
    json(route, 200, {
      issuer: `${ORIGIN}/${TENANT_ID}/v2.0`,
      authorization_endpoint: ENDPOINTS.authorize,
      token_endpoint: ENDPOINTS.token,
      end_session_endpoint: ENDPOINTS.logout,
      jwks_uri: `${ORIGIN}/${TENANT_ID}/discovery/v2.0/keys`,
      response_modes_supported: ['query', 'fragment', 'form_post'],
    });

  const authorize = (route: Route) => {
    const request = route.request();
    const params = new URL(request.url()).searchParams;
    const visit = { prompt: params.get('prompt'), inIframe: isInIframe(request) };
    entra.authorizeVisits.push(visit);
    const state = params.get('state') ?? '';
    const redirectUri = params.get('redirect_uri') ?? '';
    const sessionVisible =
      entra.session === 'alive' || (entra.session === 'hidden-from-iframes' && !visit.inIframe);
    // An interactive visit plays the user signing in at once; prompt=none needs the session.
    if (visit.prompt === 'none' && !sessionVisible) {
      return redirectTo(route, `${redirectUri}#error=login_required&state=${state}`);
    }
    pendingNonce = params.get('nonce') ?? '';
    return redirectTo(
      route,
      `${redirectUri}#code=fake-code&client_info=${CLIENT_INFO}&state=${state}`,
    );
  };

  const token = (route: Route) => {
    const form = new URLSearchParams(route.request().postData() ?? '');
    if (form.get('grant_type') === 'refresh_token' && entra.refreshTokens === 'expired') {
      return json(route, 400, {
        error: 'invalid_grant',
        error_description: 'AADSTS700084: The refresh token was issued to a single page app (SPA).',
        error_codes: [700084],
      });
    }
    // A redeemed code comes with a new refresh token, good for another 24 hours.
    if (form.get('grant_type') === 'authorization_code') entra.refreshTokens = 'valid';
    return json(route, 200, {
      token_type: 'Bearer',
      scope: form.get('scope') ?? '',
      // Under MSAL's five-minute renewal margin: every load renews, through the refresh token.
      expires_in: 60,
      ext_expires_in: 60,
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      refresh_token_expires_in: 86400,
      id_token: idToken(pendingNonce),
      client_info: CLIENT_INFO,
    });
  };

  const logout = (route: Route) => {
    entra.logoutVisits++;
    const params = new URL(route.request().url()).searchParams;
    return redirectTo(route, params.get('post_logout_redirect_uri') ?? '/');
  };

  await page.route('**/config.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: ENTRA_CONFIG_JS }),
  );
  await page.route(`${ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/.well-known/openid-configuration')) return metadata(route);
    if (route.request().url().startsWith(ENDPOINTS.authorize)) return authorize(route);
    if (route.request().url().startsWith(ENDPOINTS.token)) return token(route);
    if (route.request().url().startsWith(ENDPOINTS.logout)) return logout(route);
    return route.fulfill({ status: 404, headers: CORS });
  });
  return entra;
}
