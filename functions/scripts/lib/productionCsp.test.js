'use strict';

const { productionCsp, withProductionCsp } = require('./productionCsp');

const DEPLOYMENT = {
  apiUrl: 'https://bikebuddy-api-abc123.azurewebsites.net',
  storageUrl: 'https://bikebuddyfilesabc123.blob.core.windows.net/',
  entraSubdomain: 'bikebuddy',
};
const POLICY =
  "img-src 'self' https://*.blob.core.windows.net http://127.0.0.1:10000; " +
  "connect-src 'self' https://*.ciamlogin.com https://*.azurewebsites.net " +
  'https://*.blob.core.windows.net http://127.0.0.1:10000; frame-src https://*.ciamlogin.com';

describe('productionCsp', () => {
  it('replaces every occurrence and drops the emulator from every directive', () => {
    expect(productionCsp(POLICY, DEPLOYMENT)).toBe(
      "img-src 'self' https://bikebuddyfilesabc123.blob.core.windows.net; " +
        "connect-src 'self' https://bikebuddy.ciamlogin.com " +
        'https://bikebuddy-api-abc123.azurewebsites.net ' +
        'https://bikebuddyfilesabc123.blob.core.windows.net; ' +
        'frame-src https://bikebuddy.ciamlogin.com',
    );
  });

  it('takes an origin with or without its trailing slash', () => {
    const policy = productionCsp(POLICY, { ...DEPLOYMENT, apiUrl: `${DEPLOYMENT.apiUrl}/` });
    expect(policy).toContain(' https://bikebuddy-api-abc123.azurewebsites.net ');
  });

  it.each([
    ['apiUrl', 'http://bikebuddy-api.azurewebsites.net', 'FUNCTIONS_URL'],
    ['apiUrl', '', 'FUNCTIONS_URL'],
    ['apiUrl', 'https://', 'FUNCTIONS_URL'],
    ['apiUrl', 'https://api.example.org/path', 'FUNCTIONS_URL'],
    ['apiUrl', "https://x.example.org 'unsafe-eval'", 'FUNCTIONS_URL'],
    ['apiUrl', 'xhttps://api.example.org', 'FUNCTIONS_URL'],
    ['storageUrl', 'https://*.blob.core.windows.net', 'STORAGE_URL'],
    ['storageUrl', 'https://files.example.org;script-src', 'STORAGE_URL'],
  ])('refuses %s %j, naming %s', (field, value, name) => {
    expect(() => productionCsp(POLICY, { ...DEPLOYMENT, [field]: value })).toThrow(
      `${name} must be an https origin without a path, not "${value}"`,
    );
  });

  it.each(['', 'a.b', 'Bike Buddy', 'x/y', '-', 'ok-'])(
    'refuses the Entra subdomain %j unless it is letters, digits and dashes',
    (entraSubdomain) => {
      const accepted = /^[a-z0-9-]+$/.test(entraSubdomain);
      const call = () => productionCsp(POLICY, { ...DEPLOYMENT, entraSubdomain });
      if (accepted) expect(call).not.toThrow();
      else {
        expect(call).toThrow(`ENTRA_SUBDOMAIN must be a bare subdomain, not "${entraSubdomain}"`);
      }
    },
  );

  it.each([
    'https://*.azurewebsites.net',
    'https://*.blob.core.windows.net',
    'https://*.ciamlogin.com',
    'http://127.0.0.1:10000',
  ])('fails when the development CSP no longer allows %s', (source) => {
    const policy = POLICY.replaceAll(` ${source}`, '');
    expect(() => productionCsp(policy, DEPLOYMENT)).toThrow(
      `The development CSP no longer allows ${source}: update productionCsp.js`,
    );
  });

  it('matches a source only as a whole, not inside a longer one', () => {
    const policy = POLICY.replaceAll(
      ' https://*.azurewebsites.net',
      ' https://*.azurewebsites.net.example.org',
    );
    expect(() => productionCsp(policy, DEPLOYMENT)).toThrow(
      'The development CSP no longer allows https://*.azurewebsites.net',
    );
  });
});

describe('withProductionCsp', () => {
  const page = (policy) =>
    '<!doctype html>\n<head>\n  <meta charset="UTF-8" />\n  <meta\n' +
    `    http-equiv="Content-Security-Policy"\n    content="${policy}"\n  />\n` +
    '  <meta name="description" content="Rides on a map." />\n</head>\n';

  it('rewrites the policy of the CSP meta tag, and nothing else in the page', () => {
    expect(withProductionCsp(page(POLICY), DEPLOYMENT)).toBe(
      page(productionCsp(POLICY, DEPLOYMENT)),
    );
  });

  it('fails for a page without a CSP meta tag', () => {
    expect(() => withProductionCsp('<html><meta content="x" /></html>', DEPLOYMENT)).toThrow(
      'The page has no Content-Security-Policy meta tag',
    );
  });
});
