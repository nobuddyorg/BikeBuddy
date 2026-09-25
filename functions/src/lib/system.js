// @ts-check
'use strict';

const { randomUUID } = require('node:crypto');

// The real clock and id source; handlers take them as defaulted collaborators.
const currentTime = () => new Date();
const newId = () => randomUUID();

module.exports = { currentTime, newId };
