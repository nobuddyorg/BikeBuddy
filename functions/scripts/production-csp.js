'use strict';

// Usage: node functions/scripts/production-csp.js <page.html>; rewrites the page in place.
// Runs in the Pages deploy job, which installs no packages: Node's own modules only.

const { readFileSync, writeFileSync } = require('node:fs');
const { withProductionCsp } = require('./lib/productionCsp');

const [page] = process.argv.slice(2);
const deployment = {
  apiUrl: process.env.FUNCTIONS_URL ?? '',
  storageUrl: process.env.STORAGE_URL ?? '',
  entraSubdomain: process.env.ENTRA_SUBDOMAIN ?? '',
};
writeFileSync(page, withProductionCsp(readFileSync(page, 'utf8'), deployment));
console.log(`==> Tightened the CSP of ${page}`);
