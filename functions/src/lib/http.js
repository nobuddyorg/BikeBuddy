'use strict';

// Small helpers for v4 HTTP responses.
const error = (status, message) => ({ status, jsonBody: { error: message } });
const unauthorized = () => error(401, 'Unauthorized');

module.exports = { error, unauthorized };
