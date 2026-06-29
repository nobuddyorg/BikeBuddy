'use strict';

// ESLint config for the browser frontend (frontend/src + frontend/test).
// The app and its helpers are ES modules; the few classic scripts (config.js)
// rely on browser/CDN globals (Leaflet `L`, `msal`, `BIKEBUDDY_CONFIG`).
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['frontend/src/vendor/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        L: 'readonly',
        msal: 'readonly',
        BIKEBUDDY_CONFIG: 'readonly',
      },
    },
  },
];
