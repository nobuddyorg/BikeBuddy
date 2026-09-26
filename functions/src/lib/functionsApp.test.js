'use strict';

const { app } = require('@azure/functions');
// Loaded once outside any test, so Stryker counts their load-time mutants as static (ignoreStatic).
require('./failureResponse');

function freshFunctionsApp() {
  delete require.cache[require.resolve('./functionsApp')];
  return require('./functionsApp');
}

describe('functionsApp', () => {
  it('turns on HTTP streaming, so an upload body is never buffered whole (#550)', () => {
    const setup = vi.spyOn(app, 'setup').mockImplementation(() => {});
    try {
      const functionsApp = freshFunctionsApp();

      expect(setup).toHaveBeenCalledWith({ enableHttpStream: true });
      expect(functionsApp.app).toBe(app);
    } finally {
      setup.mockRestore();
    }
  });
});

describe('apiRoute', () => {
  function register(options) {
    const registrations = [];
    const http = vi.spyOn(app, 'http').mockImplementation((name, registration) => {
      registrations.push({ name, ...registration });
    });
    try {
      freshFunctionsApp().apiRoute('GetThing', { methods: ['get'], ...options });
    } finally {
      http.mockRestore();
    }
    return registrations;
  }

  it('registers the route under v1 and unversioned, anonymous at the host, one handler for both', () => {
    const [versioned, unversioned] = register({ route: 'things/{id}', handler: async () => ({}) });

    expect(versioned).toMatchObject({
      name: 'GetThing',
      methods: ['get'],
      authLevel: 'anonymous',
      route: 'v1/things/{id}',
    });
    expect(unversioned).toMatchObject({
      name: 'GetThingUnversioned',
      methods: ['get'],
      authLevel: 'anonymous',
      route: 'things/{id}',
    });
    expect(unversioned.handler).toBe(versioned.handler);
  });

  it('keeps an older unversioned path where the route was renamed', () => {
    const routes = register({
      route: 'things',
      unversionedRoute: 'things/upload',
      handler: async () => ({}),
    }).map(({ route }) => route);

    expect(routes).toEqual(['v1/things', 'things/upload']);
  });

  it('answers a failure with JSON, never the host default', async () => {
    const [{ handler }] = register({
      route: 'things',
      handler: async () => {
        throw new Error('boom');
      },
    });

    const response = await handler({}, { invocationId: 'inv-1', error: () => {} });

    expect(response).toEqual({
      status: 500,
      jsonBody: { error: 'errors.unexpected', invocationId: 'inv-1' },
    });
  });

  it('hands the request and context through', async () => {
    const handle = vi.fn(async () => ({ status: 204 }));
    const [{ handler }] = register({ route: 'things', handler: handle });
    const request = { url: 'x' };
    const context = { invocationId: 'inv-2' };

    expect(await handler(request, context)).toEqual({ status: 204 });
    expect(handle).toHaveBeenCalledWith(request, context);
  });
});
