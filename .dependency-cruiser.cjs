// Architecture rules over the whole module graph (functions/, frontend/, e2e/).
// Run: cd functions && npm run depcruise. Each rule says why it exists; an
// exception is a `pathNot` entry with its reason, never a disabled rule.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle between modules makes both harder to reason about and to test in isolation (#579).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment:
        'A module nothing imports and that imports nothing local is dead code. Entry points are ' +
        'run, not imported: tests, Function handlers (registered via app.http), CLI scripts, the ' +
        'service worker, the browser entry, the Playwright configs and helpers, tool configs.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(test|spec)\\.(js|ts)$',
          '\\.d\\.ts$',
          '^functions/src/[^/]+/index\\.js$',
          '^functions/scripts/',
          '^frontend/src/(app|sw|config)\\.js$',
          '^e2e/(playwright(\\.fullstack)?\\.config|global-setup|serve)\\.(ts|mjs)$',
          // Lighthouse CI tooling, started by name (lhci, npm scripts).
          '^e2e/lighthouse/',
          '(^|/)(vitest|stryker)[^/]*\\.(c|m)?js$',
          // Classic scripts loaded by index.html (see vendor-is-script-tags-only).
          '^frontend/src/vendor/',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'An import that cannot be resolved is a typo or a missing dependency.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'cosmos-only-in-db',
      severity: 'error',
      comment:
        'Cosmos is reached only through functions/src/lib/db.js: one place for RU, retries and ' +
        'the 404 normalisation. Exceptions: init-cosmos, which creates the emulator database ' +
        'db.js later opens, the full-stack e2e store, which reads back and cleans up the ' +
        'emulator directly, and the query-cost guard, which needs its own client with a ' +
        'request plugin to observe what db.js sends.',
      from: {
        pathNot: [
          '^functions/src/lib/db\\.js$',
          '^functions/scripts/init-cosmos\\.js$',
          '^e2e/tests-fullstack/store\\.ts$',
          '^functions/test/integration/query-cost\\.test\\.js$',
        ],
      },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-no-pkg'], path: '@azure/cosmos' },
    },
    {
      name: 'blob-only-in-blob-storage',
      severity: 'error',
      comment:
        'Blob Storage is reached only through functions/src/lib/blobStorage.js (SAS, container ' +
        "creation). Exceptions: the adapter's own test, which signs URLs with a real " +
        'shared-key credential to check their scope, and the full-stack e2e store, which ' +
        'reads back and cleans up Azurite directly.',
      from: {
        pathNot: [
          '^functions/src/lib/blobStorage\\.(test\\.)?js$',
          '^e2e/tests-fullstack/store\\.ts$',
        ],
      },
      to: { path: '@azure/storage-blob' },
    },
    {
      name: 'handlers-share-through-lib',
      severity: 'error',
      comment:
        'A Function handler never imports another handler; shared code lives in lib/ or middleware/.',
      from: { path: '^functions/src/([^/]+)/' },
      to: {
        path: '^functions/src/[^/]+/',
        pathNot: ['^functions/src/$1/', '^functions/src/(lib|middleware)/'],
      },
    },
    {
      name: 'backend-lib-is-a-leaf',
      severity: 'error',
      comment: 'lib/ and middleware/ serve the handlers and never depend on one.',
      from: { path: '^functions/src/(lib|middleware)/' },
      to: { path: '^functions/src/', pathNot: ['^functions/src/(lib|middleware)/'] },
    },
    {
      name: 'frontend-lib-is-pure',
      severity: 'error',
      comment:
        'frontend/src/lib/ is pure logic, unit- and mutation-tested without a DOM: it never ' +
        'imports the rendering layer (ui/) or the browser entry (app.js).',
      from: { path: '^frontend/src/lib/' },
      to: { path: '^frontend/src/(ui/|app\\.js$)' },
    },
    {
      name: 'vendor-is-script-tags-only',
      severity: 'error',
      comment:
        'The vendored bundles (MSAL, Leaflet) are classic scripts loaded from index.html and kept ' +
        'byte-identical to upstream; no module imports them.',
      from: {},
      to: { path: '^frontend/src/vendor/' },
    },
    {
      name: 'no-test-code-in-production',
      severity: 'error',
      comment: 'Production code never imports a test file or a test helper.',
      from: { pathNot: ['\\.(test|spec)\\.(js|ts)$', '^(functions|frontend)/test/', '^e2e/'] },
      to: { path: ['\\.(test|spec)\\.(js|ts)$', '^(functions|frontend)/test/', '^e2e/'] },
    },
    {
      name: 'e2e-is-black-box',
      severity: 'error',
      comment:
        'e2e/ drives the app through a browser and HTTP and never imports app internals; ' +
        'its helpers live in e2e/pages/.',
      from: { path: '^e2e/' },
      to: { path: '^(functions|frontend)/' },
    },
    {
      name: 'frontend-and-backend-are-separate',
      severity: 'error',
      comment:
        'The static frontend and the Functions API share nothing at runtime; a shared contract ' +
        'would be its own module (#574), not a cross-import.',
      from: { path: '^(functions|frontend)/' },
      to: { path: '^(functions|frontend)/', pathNot: ['^$1/'] },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', '^frontend/src/vendor/'] },
    // e2e/ and frontend/ are ESM: resolve package exports the way Node's import does.
    enhancedResolveOptions: {
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    // Tool configs are not app architecture (and e2e's ESLint config imports ESM-only packages).
    exclude: {
      path: [
        // Generated output (coverage, test and Lighthouse reports), never app code.
        '(^|/)(coverage|coverage-e2e|reports|lighthouse-reports|playwright-report[^/]*|test-results|\\.lighthouseci|\\.stryker-tmp)/',
        '(^|/)eslint[^/]*\\.(c|m)?js$',
      ],
    },
    tsPreCompilationDeps: true,
    progress: { type: 'none' },
  },
};
