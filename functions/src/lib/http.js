'use strict';

const error = (status, message) => ({ status, jsonBody: { error: message } });
const unauthorized = () => error(401, 'Unauthorized');

module.exports = { error, unauthorized };
