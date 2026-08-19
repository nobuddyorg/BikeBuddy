import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../src/style.css'), 'utf8');

function readVar(name, source) {
  const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`--${name} not found`);
  return match[1];
}

// :root holds the light theme; the dark theme only overrides a subset inside
// the prefers-color-scheme block that follows it.
const rootBlock = css.slice(
  css.indexOf(':root'),
  css.indexOf('@media (prefers-color-scheme: dark)'),
);
const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));

function relativeLuminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const AA_NORMAL_TEXT = 4.5;

describe('WCAG AA contrast (issue #438)', () => {
  it('white text on --color-primary-strong (.btn-primary) clears 4.5:1', () => {
    const bg = readVar('color-primary-strong', rootBlock);
    expect(contrastRatio('#ffffff', bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('white text on --color-primary-strong-hover clears 4.5:1', () => {
    const bg = readVar('color-primary-strong-hover', rootBlock);
    expect(contrastRatio('#ffffff', bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('white text on --color-danger-strong (.btn-danger) clears 4.5:1', () => {
    const bg = readVar('color-danger-strong', rootBlock);
    expect(contrastRatio('#ffffff', bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('white text on --color-danger-strong-hover clears 4.5:1', () => {
    const bg = readVar('color-danger-strong-hover', rootBlock);
    expect(contrastRatio('#ffffff', bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('--color-primary-text on the light surface clears 4.5:1 (.show-all-btn, mark, wordmark)', () => {
    const fg = readVar('color-primary-text', rootBlock);
    const surface = readVar('color-surface', rootBlock);
    expect(contrastRatio(fg, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('--color-primary-text on the dark surface clears 4.5:1', () => {
    const fg = readVar('color-primary-text', darkBlock);
    const surface = readVar('color-surface', darkBlock);
    expect(contrastRatio(fg, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
