'use strict';

// The rewrite against the real page, as deploy.yml publishes it (#560).

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { withProductionCsp } = require('../../scripts/lib/productionCsp');

const DEPLOYMENT = {
  apiUrl: 'https://bikebuddy-api-abc123.azurewebsites.net',
  storageUrl: 'https://bikebuddyfilesabc123.blob.core.windows.net/',
  entraSubdomain: 'bikebuddy',
};
const INDEX = readFileSync(resolve(__dirname, '../../../frontend/src/index.html'), 'utf8');
const policyOf = (html) => /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)[1];

describe('the published frontend/src/index.html', () => {
  const production = policyOf(withProductionCsp(INDEX, DEPLOYMENT));

  it("allows exactly this deployment's API, storage and Entra hosts", () => {
    expect(production).toContain(
      "connect-src 'self' https://bikebuddy.ciamlogin.com https://login.microsoftonline.com " +
        'https://bikebuddy-api-abc123.azurewebsites.net https://bikebuddyfilesabc123.blob.core.windows.net;',
    );
    expect(production).toContain('frame-src https://bikebuddy.ciamlogin.com ');
  });

  it('keeps no wildcard Azure host and no local emulator', () => {
    expect(production).not.toMatch(
      /\*\.(azurewebsites\.net|blob\.core\.windows\.net|ciamlogin\.com)/,
    );
    expect(production).not.toContain('127.0.0.1');
  });
});
