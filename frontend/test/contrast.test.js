import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(resolve(here, '../src/css/base.css'), 'utf8');

function readColor(name, source) {
  const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`--${name} not found`);
  return match[1];
}

// :root holds the light theme; the dark block after it overrides a subset.
const rootBlock = tokens.slice(
  tokens.indexOf(':root'),
  tokens.indexOf('@media (prefers-color-scheme: dark)'),
);
const darkBlock = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: dark)'));

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_NORMAL_TEXT = 4.5;

describe('WCAG AA contrast of the colour tokens', () => {
  it('white text on --color-primary-strong (.btn-primary) clears 4.5:1', () => {
    const background = readColor('color-primary-strong', rootBlock);
    expect(contrastRatio('#ffffff', background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('white text on --color-primary-strong-hover clears 4.5:1', () => {
    const background = readColor('color-primary-strong-hover', rootBlock);
    expect(contrastRatio('#ffffff', background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('white text on --color-danger-strong (.btn-danger) clears 4.5:1', () => {
    const background = readColor('color-danger-strong', rootBlock);
    expect(contrastRatio('#ffffff', background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('white text on --color-danger-strong-hover clears 4.5:1', () => {
    const background = readColor('color-danger-strong-hover', rootBlock);
    expect(contrastRatio('#ffffff', background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('--color-primary-text on the light surface clears 4.5:1 (.show-all-btn, mark, wordmark)', () => {
    const foreground = readColor('color-primary-text', rootBlock);
    const surface = readColor('color-surface', rootBlock);
    expect(contrastRatio(foreground, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('--color-primary-text on the dark surface clears 4.5:1', () => {
    const foreground = readColor('color-primary-text', darkBlock);
    const surface = readColor('color-surface', darkBlock);
    expect(contrastRatio(foreground, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('--color-danger-text (the profile danger-zone heading) clears 4.5:1 in both themes', () => {
    expect(
      contrastRatio(
        readColor('color-danger-text', rootBlock),
        readColor('color-surface', rootBlock),
      ),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(
      contrastRatio(
        readColor('color-danger-text', darkBlock),
        readColor('color-surface', darkBlock),
      ),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('--color-text-muted clears 4.5:1 on --color-surface-2 (selected row, chips) in both themes', () => {
    for (const block of [rootBlock, darkBlock]) {
      const muted = readColor('color-text-muted', block);
      const surface2 = readColor('color-surface-2', block);
      expect(contrastRatio(muted, surface2)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });
});
