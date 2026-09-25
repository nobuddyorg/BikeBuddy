// @ts-check

// Reads the deployment's BIKEBUDDY_CONFIG (config.js). Dev auth pairs with the
// backend's SKIP_AUTH, so the app also works before a tenant is configured
// and flips to real auth the moment one is.
export function resolveAuthConfig(config) {
  const subdomain = config.entraSubdomain || '';
  const clientId = config.entraClientId || '';
  return {
    apiBase: config.apiBaseUrl || '',
    useDevAuth: Boolean(config.devMode) || !(subdomain && clientId),
    clientId,
    // Microsoft Entra External ID authority: https://<subdomain>.ciamlogin.com/
    authority: `https://${subdomain}.ciamlogin.com/`,
    knownAuthorities: [`${subdomain}.ciamlogin.com`],
    loginScopes: ['openid', 'profile', ...(config.entraApiScope ? [config.entraApiScope] : [])],
  };
}

export function userFromAccount(account) {
  return { id: account.homeAccountId, email: account.username || '' };
}

// Right after sign-up the ID token may carry the address only as
// preferred_username, or not at all.
export function userFromAuthResult(result) {
  return {
    id: result.account.homeAccountId,
    email:
      result.idTokenClaims?.email ||
      result.idTokenClaims?.preferred_username ||
      result.account.username,
  };
}
