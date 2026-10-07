// @ts-check

// Dev auth pairs with the backend's SKIP_AUTH: it runs until a tenant is configured.
export function resolveAuthConfig(config) {
  const subdomain = config.entraSubdomain || '';
  const clientId = config.entraClientId || '';
  const tenantId = config.entraTenantId || '';
  return {
    apiBase: config.apiBaseUrl || '',
    useDevAuth: Boolean(config.devMode) || !(subdomain && clientId),
    clientId,
    // Microsoft Entra External ID authority: https://<subdomain>.ciamlogin.com/
    authority: `https://${subdomain}.ciamlogin.com/`,
    // External ID's discovery names the tenant-ID host as issuer; MSAL 5 refuses an issuer it doesn't know.
    knownAuthorities: [
      `${subdomain}.ciamlogin.com`,
      ...(tenantId ? [`${tenantId}.ciamlogin.com`] : []),
    ],
    loginScopes: ['openid', 'profile', ...(config.entraApiScope ? [config.entraApiScope] : [])],
  };
}

export function userFromAccount(account) {
  return { id: account.homeAccountId, email: account.username || '' };
}

// Right after sign-up the ID token may lack the email claim.
export function userFromAuthResult(result) {
  return {
    id: result.account.homeAccountId,
    email:
      result.idTokenClaims?.email ||
      result.idTokenClaims?.preferred_username ||
      result.account.username,
  };
}
