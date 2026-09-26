// @ts-check
'use strict';

const { randomUUID } = require('node:crypto');
const { createRateLimiter, uploadRateLimits } = require('./rateLimit');

// The real clock and id source; handlers take them as defaulted collaborators.
const currentTime = () => new Date();
const newId = () => randomUUID();

// One upload budget for tour and photo uploads, shared by both handlers in this instance (#549).
const uploadRateLimiter = createRateLimiter(uploadRateLimits(process.env));

module.exports = { currentTime, newId, uploadRateLimiter };
