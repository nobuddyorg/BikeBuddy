import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  normalizeLocale,
  pickLocale,
  translate,
  isSupported,
  SUPPORTED_LOCALES,
} from '../src/lib/i18n.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (code) =>
  JSON.parse(readFileSync(resolve(here, `../src/locales/${code}.json`), 'utf8'));

describe('normalizeLocale', () => {
  it('maps region tags to the supported base language', () => {
    expect(normalizeLocale('de-DE')).toBe('de');
    expect(normalizeLocale('ES')).toBe('es');
    expect(normalizeLocale('en-GB')).toBe('en');
  });

  it('returns null for unsupported or empty input', () => {
    expect(normalizeLocale('fr')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
  });
});

describe('pickLocale', () => {
  it('prefers a valid stored override', () => {
    expect(pickLocale({ stored: 'es', languages: ['de-DE'] })).toBe('es');
  });

  it('falls back to the first matching browser language', () => {
    expect(pickLocale({ stored: null, languages: ['fr-FR', 'de-DE', 'en'] })).toBe('de');
  });

  it('falls back to en when nothing matches', () => {
    expect(pickLocale({ stored: 'xx', languages: ['fr', 'it'] })).toBe('en');
  });
});

describe('translate', () => {
  const messages = { greet: 'Hallo {name}', plain: 'Tour' };

  it('looks up a key and interpolates params', () => {
    expect(translate(messages, 'greet', { name: 'Ada' })).toBe('Hallo Ada');
  });

  it('falls back to the fallback messages, then the key itself', () => {
    expect(translate(messages, 'missing', {}, { missing: 'Fallback' })).toBe('Fallback');
    expect(translate(messages, 'unknown.key')).toBe('unknown.key');
  });

  it('leaves unknown placeholders intact', () => {
    expect(translate(messages, 'greet', {})).toBe('Hallo {name}');
  });
});

describe('locale files', () => {
  const en = load('en');
  const others = SUPPORTED_LOCALES.map((l) => l.code).filter((c) => c !== 'en');

  it.each(others)('%s has exactly the same keys as en', (code) => {
    expect(Object.keys(load(code)).sort()).toEqual(Object.keys(en).sort());
  });

  it('every locale has non-empty string values', () => {
    for (const { code } of SUPPORTED_LOCALES) {
      const values = Object.values(load(code));
      expect(values.every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
    }
  });

  it('isSupported reflects SUPPORTED_LOCALES', () => {
    expect(isSupported('en')).toBe(true);
    expect(isSupported('fr')).toBe(false);
  });
});
