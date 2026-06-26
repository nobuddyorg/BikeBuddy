'use strict';

// ESLint config for the browser frontend (frontend/*.js). Separate from the
// Node config because the frontend runs in the browser with CDN/vendored
// globals (Leaflet `L`, `msal`) and the generated `BIKEBUDDY_CONFIG`.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        L: 'readonly',
        msal: 'readonly',
        BIKEBUDDY_CONFIG: 'readonly',
      },
    },
  },
];
