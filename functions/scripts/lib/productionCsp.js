'use strict';

// The development CSP in frontend/src/index.html allows any Azure host and Azurite; the deployed
// page allows exactly the hosts this deployment uses (#560).
const DEVELOPMENT_SOURCES = {
  api: 'https://*.azurewebsites.net',
  storage: 'https://*.blob.core.windows.net',
  entra: 'https://*.ciamlogin.com',
  azurite: 'http://127.0.0.1:10000',
};
const ORIGIN_PATTERN = /^https:\/\/[a-z0-9.-]+$/;
const SUBDOMAIN_PATTERN = /^[a-z0-9-]+$/;
const CSP_META = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/;

function origin(name, url) {
  const trimmed = String(url).replace(/\/$/, '');
  if (!ORIGIN_PATTERN.test(trimmed)) {
    throw new Error(`${name} must be an https origin without a path, not "${url}"`);
  }
  return trimmed;
}

function replaceSource(policy, source, replacement) {
  if (!policy.split(/[\s;]/).includes(source)) {
    throw new Error(`The development CSP no longer allows ${source}: update productionCsp.js`);
  }
  return policy.replaceAll(` ${source}`, replacement ? ` ${replacement}` : '');
}

/**
 * The development policy with each wildcard replaced by this deployment's exact origin, and the
 * local emulator dropped.
 *
 * @param {string} policy
 * @param {{ apiUrl: string, storageUrl: string, entraSubdomain: string }} deployment
 */
function productionCsp(policy, { apiUrl, storageUrl, entraSubdomain }) {
  if (!SUBDOMAIN_PATTERN.test(entraSubdomain)) {
    throw new Error(`ENTRA_SUBDOMAIN must be a bare subdomain, not "${entraSubdomain}"`);
  }
  let tightened = replaceSource(policy, DEVELOPMENT_SOURCES.api, origin('FUNCTIONS_URL', apiUrl));
  tightened = replaceSource(
    tightened,
    DEVELOPMENT_SOURCES.storage,
    origin('STORAGE_URL', storageUrl),
  );
  tightened = replaceSource(
    tightened,
    DEVELOPMENT_SOURCES.entra,
    `https://${entraSubdomain}.ciamlogin.com`,
  );
  return replaceSource(tightened, DEVELOPMENT_SOURCES.azurite, '');
}

/** The page with its CSP meta tag rewritten by productionCsp. */
function withProductionCsp(html, deployment) {
  const match = CSP_META.exec(html);
  if (!match) throw new Error('The page has no Content-Security-Policy meta tag');
  const [tag, opening, policy, closing] = match;
  return html.replace(tag, `${opening}${productionCsp(policy, deployment)}${closing}`);
}

module.exports = { productionCsp, withProductionCsp };
