'use strict';

// The API and the frontend agree on what the frontend cannot check at runtime: error keys, languages.

const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { ERROR_KEYS } = require('../../src/lib/http');
const { SUPPORTED_LANGUAGE_CODES } = require('../../src/lib/validation');

const FRONTEND = path.join(__dirname, '../../../frontend/src');
const SOURCE = path.join(__dirname, '../../src');
const readText = (file) => readFileSync(file, 'utf8');

const localeCodes = () =>
  readdirSync(path.join(FRONTEND, 'locales'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.basename(name, '.json'))
    .sort();
const locale = (code) => JSON.parse(readText(path.join(FRONTEND, 'locales', `${code}.json`)));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [full] : [];
  });
}

describe('API error bodies', () => {
  test.each(localeCodes())('every key the API sends is in %s.json', (code) => {
    const messages = locale(code);
    const missing = Object.values(ERROR_KEYS).filter((key) => !(key in messages));
    expect(missing).toEqual([]);
  });

  // A literal would bypass the keys above and reach the user untranslated.
  test('no handler passes a literal message to error() or badRequest()', () => {
    const literalMessage = /(?<![.\w])(?:error\(\s*\d{3}\s*,|badRequest\()\s*['"`]/;
    const offenders = sourceFiles(SOURCE).filter((file) => literalMessage.test(readText(file)));
    expect(offenders.map((file) => path.relative(SOURCE, file))).toEqual([]);
  });
});

describe('supported languages', () => {
  const sorted = (codes) => [...codes].sort();

  test('the API accepts exactly the languages there are locale files for', () => {
    expect(sorted(SUPPORTED_LANGUAGE_CODES)).toEqual(localeCodes());
  });

  test("the frontend's picker offers exactly those languages", () => {
    const i18nSource = readText(path.join(FRONTEND, 'lib/i18n.js'));
    const offered = [...i18nSource.matchAll(/\{ code: '([a-z-]+)'/g)].map(([, code]) => code);
    expect(sorted(offered)).toEqual(localeCodes());
  });

  test('the service worker precaches every locale file', () => {
    const serviceWorker = readText(path.join(FRONTEND, 'sw.js'));
    const precached = [...serviceWorker.matchAll(/'locales\/([a-z-]+)\.json'/g)].map(
      ([, code]) => code,
    );
    expect(sorted(precached)).toEqual(localeCodes());
  });
});
