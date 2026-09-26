'use strict';

const { openIdConfigUrl } = require('./oidcMetadataUrl');

const ENTRA_ENVIRONMENT = {
  ENTRA_TENANT_SUBDOMAIN: 'bikebuddy',
  ENTRA_TENANT_ID: 'aaaabbbb-0000-cccc-1111-dddd2222eeee',
  ENTRA_CLIENT_ID: 'test-client-id',
};
const ENTRA_METADATA_URL =
  'https://bikebuddy.ciamlogin.com/aaaabbbb-0000-cccc-1111-dddd2222eeee/v2.0/.well-known/openid-configuration';
const LOCAL_METADATA_URL = 'http://127.0.0.1:43123/tenant/v2.0/.well-known/openid-configuration';
const NOT_LOCAL = 'ENTRA_OIDC_METADATA_URL must be an http(s) URL on localhost or a loopback IP';

const withOverride = (override, extra = {}) => ({
  ...ENTRA_ENVIRONMENT,
  ENTRA_OIDC_METADATA_URL: override,
  ...extra,
});

describe('openIdConfigUrl without an override', () => {
  test('builds the ciamlogin metadata URL from the tenant settings', () => {
    expect(openIdConfigUrl(ENTRA_ENVIRONMENT)).toBe(ENTRA_METADATA_URL);
  });

  test('treats an empty override as unset', () => {
    expect(openIdConfigUrl(withOverride(''))).toBe(ENTRA_METADATA_URL);
  });

  test('ignores the Azure instance settings, which every deployed app has', () => {
    const environment = { ...ENTRA_ENVIRONMENT, WEBSITE_SITE_NAME: 'func-bikebuddy' };
    expect(openIdConfigUrl(environment)).toBe(ENTRA_METADATA_URL);
  });
});

describe('openIdConfigUrl with a local override', () => {
  test.each([
    LOCAL_METADATA_URL,
    'http://localhost:7000/.well-known/openid-configuration',
    'https://localhost/.well-known/openid-configuration',
    'http://[::1]:7000/.well-known/openid-configuration',
  ])('honours %s', (override) => {
    expect(openIdConfigUrl(withOverride(override))).toBe(override);
  });

  test('honours it when the Azure instance settings are present but empty', () => {
    const environment = withOverride(LOCAL_METADATA_URL, {
      WEBSITE_SITE_NAME: '',
      WEBSITE_INSTANCE_ID: '',
    });
    expect(openIdConfigUrl(environment)).toBe(LOCAL_METADATA_URL);
  });
});

describe('openIdConfigUrl refuses an override that is not local', () => {
  test.each([
    ['a remote host', 'https://login.example.com/.well-known/openid-configuration'],
    ['a host that only starts with localhost', 'http://localhost.example.com/metadata'],
    ['credentials in front of a remote host', 'http://localhost@example.com/metadata'],
    ['a loopback IP outside the allowed set', 'http://127.0.0.2/metadata'],
    ['a protocol other than http(s)', 'ftp://localhost/metadata'],
    ['a value that is not a URL', 'localhost/metadata'],
  ])('throws for %s', (_label, override) => {
    expect(() => openIdConfigUrl(withOverride(override))).toThrow(NOT_LOCAL);
  });
});

describe('openIdConfigUrl refuses any override inside Azure', () => {
  test.each(['WEBSITE_SITE_NAME', 'WEBSITE_INSTANCE_ID'])(
    'throws when %s is set, even for a loopback URL',
    (setting) => {
      const environment = withOverride(LOCAL_METADATA_URL, { [setting]: 'func-bikebuddy' });
      expect(() => openIdConfigUrl(environment)).toThrow(
        `ENTRA_OIDC_METADATA_URL must not be set in Azure (${setting} is set)`,
      );
    },
  );

  test('names every Azure setting it found', () => {
    const environment = withOverride(LOCAL_METADATA_URL, {
      WEBSITE_SITE_NAME: 'func-bikebuddy',
      WEBSITE_INSTANCE_ID: 'instance-1',
    });
    expect(() => openIdConfigUrl(environment)).toThrow(
      '(WEBSITE_SITE_NAME, WEBSITE_INSTANCE_ID is set)',
    );
  });
});
