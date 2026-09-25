// @ts-check
'use strict';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const WEB_PROTOCOLS = new Set(['http:', 'https:']);
// Set by Azure on a deployed Function App.
const AZURE_INSTANCE_SETTINGS = ['WEBSITE_SITE_NAME', 'WEBSITE_INSTANCE_ID'];

// ENTRA_TENANT_SUBDOMAIN is the leading host label ("bikebuddy"), ENTRA_TENANT_ID the directory GUID.
function entraMetadataUrl(environment) {
  const subdomain = environment.ENTRA_TENANT_SUBDOMAIN;
  const tenantId = environment.ENTRA_TENANT_ID;
  return `https://${subdomain}.ciamlogin.com/${tenantId}/v2.0/.well-known/openid-configuration`;
}

function isLoopbackWebUrl(value) {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return WEB_PROTOCOLS.has(url.protocol) && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Entra's OIDC metadata URL, or ENTRA_OIDC_METADATA_URL for a local test issuer.
 * Throws for an override inside Azure or off this machine: it never falls back quietly.
 *
 * @param {Record<string, string | undefined>} environment
 */
function openIdConfigUrl(environment) {
  const override = environment.ENTRA_OIDC_METADATA_URL;
  if (!override) return entraMetadataUrl(environment);

  const azureSettings = AZURE_INSTANCE_SETTINGS.filter((name) => environment[name]);
  if (azureSettings.length > 0) {
    throw new Error(
      `ENTRA_OIDC_METADATA_URL must not be set in Azure (${azureSettings.join(', ')} is set)`,
    );
  }
  if (!isLoopbackWebUrl(override)) {
    throw new Error('ENTRA_OIDC_METADATA_URL must be an http(s) URL on localhost or a loopback IP');
  }
  return override;
}

module.exports = { openIdConfigUrl };
