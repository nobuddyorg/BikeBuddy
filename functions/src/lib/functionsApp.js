// @ts-check
'use strict';

const { app } = require('@azure/functions');

// Without it the host buffers every request body whole, so parseMultipart's size limit bounds nothing.
app.setup({ enableHttpStream: true });

module.exports = { app };
