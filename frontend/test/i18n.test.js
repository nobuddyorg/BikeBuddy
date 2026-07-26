import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  normalizeLocale,
  pickLocale,
  translate,
  translateApiMessage,
  applyI18n,
  I18N_ATTRS,
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
    expect(normalizeLocale('ja')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
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

describe('translateApiMessage', () => {
  const messages = { 'errors.tourName': 'Bitte gib einen Namen an.' };

  it('localises an error key returned by the API', () => {
    expect(translateApiMessage(messages, 'errors.tourName')).toBe('Bitte gib einen Namen an.');
  });

  it('passes prose from the API through untouched', () => {
    expect(translateApiMessage(messages, 'Tour not found')).toBe('Tour not found');
  });

  it('falls back to English for a key the active locale is missing', () => {
    expect(translateApiMessage({}, 'errors.tourDate', { 'errors.tourDate': 'Bad date.' })).toBe(
      'Bad date.',
    );
  });

  it('shows an unknown key rather than nothing', () => {
    expect(translateApiMessage({}, 'errors.somethingNew')).toBe('errors.somethingNew');
  });
});

// applyI18n only ever calls root.querySelectorAll and reads/writes attributes,
// so a stand-in is enough to pin which attributes it applies without a DOM.
// With no messages loaded, t() resolves a key to itself — that is the assertion
// handle: the key reaching the right attribute is what this guards (#365).
describe('applyI18n', () => {
  const makeEl = (attrs) => ({
    attrs,
    dataset: {
      i18n: attrs['data-i18n'],
      i18nHtml: attrs['data-i18n-html'],
    },
    applied: {},
    getAttribute(name) {
      return this.attrs[name];
    },
    setAttribute(name, value) {
      this.applied[name] = value;
    },
  });

  const makeRoot = (elements) => ({
    querySelectorAll(selector) {
      const name = selector.slice(1, -1);
      return elements.filter((el) => name in el.attrs);
    },
  });

  it('translates every supported attribute', () => {
    const elements = I18N_ATTRS.map((attr) => makeEl({ [`data-i18n-${attr}`]: `key.${attr}` }));

    applyI18n(makeRoot(elements));

    elements.forEach((el, i) => {
      expect(el.applied[I18N_ATTRS[i]]).toBe(`key.${I18N_ATTRS[i]}`);
    });
  });

  it('covers the multi-word attribute name', () => {
    expect(I18N_ATTRS).toContain('aria-label');
  });

  it('writes text and markup content to their own sinks', () => {
    const text = makeEl({ 'data-i18n': 'nav.upload' });
    const html = makeEl({ 'data-i18n-html': 'help.a2' });

    applyI18n(makeRoot([text, html]));

    expect(text.textContent).toBe('nav.upload');
    expect(html.innerHTML).toBe('help.a2');
    // Content sinks are assignments, never setAttribute.
    expect(text.applied).toEqual({});
    expect(html.applied).toEqual({});
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

  // The keys TOUR_META_ERROR_KEYS in functions/src/lib/validation.js sends as
  // error bodies. Separate deployables, so nothing but this test ties them.
  const API_ERROR_KEYS = [
    'errors.tourName',
    'errors.tourDescription',
    'errors.tourDate',
    'errors.tourInvalid',
  ];

  it.each(SUPPORTED_LOCALES.map((l) => l.code))('%s translates every API error key', (code) => {
    const messages = load(code);
    for (const key of API_ERROR_KEYS) expect(messages[key]).toBeTruthy();
  });

  it('isSupported reflects SUPPORTED_LOCALES', () => {
    expect(isSupported('en')).toBe(true);
    expect(isSupported('ja')).toBe(false);
  });
});
