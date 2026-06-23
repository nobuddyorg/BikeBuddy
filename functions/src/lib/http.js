'use strict';

// Small helpers for v4 HTTP responses.
const json = (status, body) => ({ status, jsonBody: body });
const error = (status, message) => ({ status, jsonBody: { error: message } });
const unauthorized = () => error(401, 'Unauthorized');

module.exports = { json, error, unauthorized };
