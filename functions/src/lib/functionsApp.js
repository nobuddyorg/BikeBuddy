// @ts-check
'use strict';

const { app } = require('@azure/functions');
const { withFailureResponse } = require('./failureResponse');

// Without it the host buffers every request body whole, so parseMultipart's size limit bounds nothing.
app.setup({ enableHttpStream: true });

const API_VERSION = 'v1';

/**
 * Registers a handler under /api/v1/ (#579) and, for pages loaded before the move, under its
 * unversioned path: the same handler, so the alias can never authorize differently.
 *
 * @param {string} name
 * @param {{ methods: import('@azure/functions').HttpMethod[], route: string,
 *   unversionedRoute?: string, handler: (request: any, context: any) => Promise<object> | object }} options
 */
function apiRoute(name, { methods, route, unversionedRoute = route, handler }) {
  const registration = {
    methods,
    authLevel: /** @type {const} */ ('anonymous'),
    handler: withFailureResponse(handler),
  };
  app.http(name, { ...registration, route: `${API_VERSION}/${route}` });
  app.http(`${name}Unversioned`, { ...registration, route: unversionedRoute });
}

module.exports = { app, apiRoute };
