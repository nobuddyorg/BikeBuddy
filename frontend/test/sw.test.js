import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

// sw.js runs as a classic (non-module) worker script, so it can't be
// imported directly — pull PRECACHE_URLS out of the source text instead.
// This is what keeps the list honest as lib/ui files come and go: nothing
// else in the repo re-derives it, so drift would otherwise only surface as
// a blank page offline.
const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../src');

const swSource = readFileSync(resolve(srcDir, 'sw.js'), 'utf8');
const match = swSource.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('sw.js: PRECACHE_URLS not found');
const PRECACHE_URLS = new Function(`return ${match[1]}`)();

function listFiles(dir, exts) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, exts);
    return exts.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

const relPath = (full) =>
  full
    .slice(srcDir.length + 1)
    .split('\\')
    .join('/');

describe('service worker precache list', () => {
  it('includes every lib/ and ui/ module', () => {
    const jsFiles = [
      ...listFiles(join(srcDir, 'lib'), ['.js']),
      ...listFiles(join(srcDir, 'ui'), ['.js']),
    ].map(relPath);
    for (const file of jsFiles) expect(PRECACHE_URLS).toContain(file);
  });

  it('includes every locale file', () => {
    const localeFiles = listFiles(join(srcDir, 'locales'), ['.json']).map(relPath);
    for (const file of localeFiles) expect(PRECACHE_URLS).toContain(file);
  });

  // config.js is gitignored (generated per-deployment) so it never exists in
  // a fresh checkout — everything else listed must be real.
  it('lists no file that is missing on disk', () => {
    for (const url of PRECACHE_URLS) {
      if (url === './' || url === 'config.js') continue;
      expect(existsSync(join(srcDir, url)), `${url} is listed but missing on disk`).toBe(true);
    }
  });
});
