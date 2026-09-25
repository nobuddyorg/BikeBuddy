import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  filterLocales,
  localeMeta,
  pickLocale,
  supportedLocaleCodes,
  translate,
  isSupported,
  SUPPORTED_LOCALES,
} from '../src/lib/i18n.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (code) =>
  JSON.parse(readFileSync(resolve(here, `../src/locales/${code}.json`), 'utf8'));

describe('supportedLocaleCodes', () => {
  it('maps region tags to the supported base language', () => {
    expect(supportedLocaleCodes(['de-DE', 'ES', 'en-GB'])).toEqual(['de', 'es', 'en']);
  });

  it('drops unsupported and empty candidates', () => {
    expect(supportedLocaleCodes(['ja', '', undefined, null, 'fr'])).toEqual(['fr']);
  });
});

describe('SUPPORTED_LOCALES', () => {
  it('describes every locale completely for the language menu and Intl', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(locale.label).not.toBe('');
      expect(locale.flag).not.toBe('');
      expect(locale.short).toBe(locale.code.toUpperCase());
      expect(locale.intlLocale.startsWith(`${locale.code}-`)).toBe(true);
    }
    const labels = SUPPORTED_LOCALES.map((locale) => locale.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('localeMeta', () => {
  it('describes a supported locale', () => {
    expect(localeMeta('de')).toMatchObject({ code: 'de', intlLocale: 'de-DE' });
  });

  it('falls back to English for an unknown code', () => {
    expect(localeMeta('xx')).toMatchObject({ code: 'en', intlLocale: 'en-GB' });
  });
});

describe('pickLocale', () => {
  it('prefers a valid stored override', () => {
    expect(pickLocale({ stored: 'es', languages: ['de-DE'] })).toBe('es');
  });

  it('falls back to the first matching browser language', () => {
    expect(pickLocale({ stored: null, languages: ['ja-JP', 'de-DE', 'en'] })).toBe('de');
  });

  it('falls back to en when nothing matches', () => {
    expect(pickLocale({ stored: 'xx', languages: ['ja', 'ko'] })).toBe('en');
    expect(pickLocale({ stored: null, languages: [] })).toBe('en');
  });
});

describe('translate', () => {
  const messages = { greet: 'Hallo {name}', plain: 'Tour', total: '{count} gesamt' };
  const de = (key, params) => translate({ messages, key, params, locale: 'de-DE' });

  it('looks up a key and interpolates params', () => {
    expect(de('greet', { name: 'Ada' })).toBe('Hallo Ada');
    expect(de('plain')).toBe('Tour');
  });

  it('falls back to the fallback messages, then the key itself', () => {
    const fallbackMessages = { missing: 'Fallback' };
    expect(translate({ messages, fallbackMessages, key: 'missing', locale: 'de-DE' })).toBe(
      'Fallback',
    );
    expect(de('unknown.key')).toBe('unknown.key');
  });

  it('leaves unknown placeholders intact', () => {
    expect(de('greet', {})).toBe('Hallo {name}');
  });

  it('formats numeric params for the locale', () => {
    expect(de('total', { count: 12345 })).toBe('12.345 gesamt');
    expect(translate({ messages, key: 'total', params: { count: 12345 }, locale: 'en-GB' })).toBe(
      '12,345 gesamt',
    );
  });

  it('passes an API sentence (not a key) through untouched', () => {
    expect(de('Tour not found')).toBe('Tour not found');
  });

  describe('plural forms', () => {
    const plural = {
      'tours.one': '{count} tour',
      'tours.other': '{count} tours',
    };
    const tours = ({ count, locale = 'en-GB', table = plural }) =>
      translate({ messages: table, key: 'tours', params: { count }, locale });

    it('picks the form the locale’s plural rules name for the count', () => {
      expect(tours({ count: 1 })).toBe('1 tour');
      expect(tours({ count: 0 })).toBe('0 tours');
      expect(tours({ count: 2 })).toBe('2 tours');
      // French puts 0 in the singular.
      expect(tours({ count: 0, locale: 'fr-FR' })).toBe('0 tour');
    });

    it('uses `other` for a category the locale file leaves out', () => {
      // 1,000,000 is Spanish `many`; only one/other are written.
      expect(tours({ count: 1000000, locale: 'es-ES' })).toBe('1.000.000 tours');
    });

    it('falls back to the English plural forms, then a plain key', () => {
      expect(
        translate({
          messages: {},
          fallbackMessages: plural,
          key: 'tours',
          params: { count: 1 },
          locale: 'en-GB',
        }),
      ).toBe('1 tour');
      expect(tours({ count: 3, table: { tours: '{count} rides' } })).toBe('3 rides');
    });

    it('does not pluralise when count is not a number', () => {
      expect(
        translate({ messages: plural, key: 'tours', params: { count: '2' }, locale: 'en-GB' }),
      ).toBe('tours');
    });
  });
});

describe('locale files', () => {
  const en = load('en');
  const codes = SUPPORTED_LOCALES.map((locale) => locale.code);
  const others = codes.filter((code) => code !== 'en');

  it.each(others)('%s has exactly the same keys as en', (code) => {
    expect(Object.keys(load(code)).sort()).toEqual(Object.keys(en).sort());
  });

  it('every locale has non-empty string values', () => {
    for (const { code } of SUPPORTED_LOCALES) {
      const values = Object.values(load(code));
      expect(values.every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
    }
  });

  // TOUR_META_ERROR_KEYS in functions/src/lib/validation.js; only this test ties the two deployables.
  const API_ERROR_KEYS = [
    'errors.tourName',
    'errors.tourDescription',
    'errors.tourDate',
    'errors.tourInvalid',
  ];

  it.each(codes)('%s translates every API error key', (code) => {
    const messages = load(code);
    for (const key of API_ERROR_KEYS) expect(messages[key]).toBeTruthy();
  });

  // translate falls back to `other` for any category a locale file leaves out.
  it.each(codes)('%s gives every plural key an `other` form', (code) => {
    const keys = Object.keys(load(code));
    const pluralBases = keys.filter((key) => key.endsWith('.one')).map((key) => key.slice(0, -4));
    expect(pluralBases.length).toBeGreaterThan(0);
    for (const base of pluralBases) expect(keys).toContain(`${base}.other`);
  });

  it('isSupported reflects SUPPORTED_LOCALES', () => {
    expect(isSupported('en')).toBe(true);
    expect(isSupported('ja')).toBe(false);
  });
});

describe('filterLocales', () => {
  const codes = (query) => filterLocales(query).map((locale) => locale.code);

  it('matches the name, code or short label, ignoring case and padding', () => {
    expect(codes('deut')).toEqual(['de']);
    expect(codes('  deut  ')).toEqual(['de']);
    expect(codes('NL')).toEqual(['nl']);
    expect(codes('pt')).toEqual(['pt']);
  });

  it('lists every locale for an empty query and none for a miss', () => {
    expect(codes('')).toEqual(SUPPORTED_LOCALES.map((locale) => locale.code));
    expect(codes('klingon')).toEqual([]);
  });
});
