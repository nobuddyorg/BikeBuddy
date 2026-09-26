import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cssDir = resolve(here, '../src/css');
const stylesheets = readdirSync(cssDir).filter((name) => name.endsWith('.css'));

describe('stylesheets', () => {
  // A url() resolves against the stylesheet, not the page, so a moved rule can silently 404.
  it.each(stylesheets)('%s only points at files that exist', (name) => {
    const source = readFileSync(join(cssDir, name), 'utf8');
    for (const [, target] of source.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      expect(existsSync(resolve(cssDir, target)), `${name}: ${target}`).toBe(true);
    }
  });

  it('never @import each other, so the browser fetches them in parallel', () => {
    for (const name of stylesheets) {
      expect(readFileSync(join(cssDir, name), 'utf8')).not.toMatch(/@import/);
    }
  });
});
