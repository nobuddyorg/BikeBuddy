import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The browser half of i18n (ui/i18n.js) (init, setLanguage, the current-locale getters)
// with fetch, storage, navigator, document and location stubbed. The module
// keeps the current locale in module state, so each test imports it fresh.

const MESSAGES = {
  en: { greeting: 'Hello {name}', onlyEnglish: 'Fallback', 'errors.x': 'Bad input' },
  de: { greeting: 'Hallo {name}' },
};

function stubBrowser({ stored = null, languages = ['de-DE'], failLocale = null } = {}) {
  const storage = new Map(stored ? [['bikebuddy-lang', stored]] : []);
  const removeClass = vi.fn();
  const reload = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  });
  vi.stubGlobal('navigator', { languages, language: languages[0] });
  vi.stubGlobal('document', {
    documentElement: { lang: '' },
    body: { classList: { remove: removeClass } },
    querySelectorAll: () => [],
  });
  vi.stubGlobal('location', { reload });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const code = /locales\/(\w+)\.json$/.exec(url)[1];
      if (code === failLocale) return { ok: false, status: 404 };
      return { ok: true, json: async () => MESSAGES[code] };
    }),
  );
  return { storage, removeClass, reload };
}

async function freshI18n() {
  vi.resetModules();
  return import('../src/ui/i18n.js');
}

describe('i18n runtime', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('starts in English before init', async () => {
    const i18n = await freshI18n();
    expect(i18n.getLocale()).toBe('en');
    expect(i18n.getLocaleMeta().code).toBe('en');
    expect(i18n.dateLocale()).toBe('en-GB');
  });

  it('picks the browser language, falls back to English per key, and reveals the page', async () => {
    const { removeClass } = stubBrowser({ languages: ['de-DE'] });
    const i18n = await freshI18n();
    await i18n.init();
    expect(i18n.getLocale()).toBe('de');
    expect(i18n.dateLocale()).toBe('de-DE');
    expect(document.documentElement.lang).toBe('de');
    expect(i18n.t('greeting', { name: 'Ada' })).toBe('Hallo Ada');
    expect(i18n.t('onlyEnglish')).toBe('Fallback');
    expect(i18n.tApi('errors.x')).toBe('Bad input');
    expect(i18n.tApi('A sentence from the API.')).toBe('A sentence from the API.');
    expect(removeClass).toHaveBeenCalledWith('i18n-loading');
  });

  it('prefers the stored language over the browser one', async () => {
    stubBrowser({ stored: 'de', languages: ['en-US'] });
    const i18n = await freshI18n();
    await i18n.init();
    expect(i18n.getLocale()).toBe('de');
  });

  it('loads English once when English is picked', async () => {
    stubBrowser({ languages: ['en-US'] });
    const i18n = await freshI18n();
    await i18n.init();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(i18n.t('greeting', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('falls back to English strings when the chosen locale fails to load', async () => {
    stubBrowser({ languages: ['de'], failLocale: 'de' });
    const i18n = await freshI18n();
    await i18n.init();
    expect(i18n.t('greeting', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('uses the chosen locale alone when the English fallback fails to load', async () => {
    stubBrowser({ languages: ['de'], failLocale: 'en' });
    const i18n = await freshI18n();
    await i18n.init();
    expect(i18n.t('greeting', { name: 'Ada' })).toBe('Hallo Ada');
    expect(i18n.t('onlyEnglish')).toBe('onlyEnglish');
  });

  it('shows keys when even English fails to load', async () => {
    stubBrowser({ languages: ['en'], failLocale: 'en' });
    const i18n = await freshI18n();
    await i18n.init();
    expect(i18n.t('greeting')).toBe('greeting');
  });

  it('uses navigator.language when navigator.languages is empty', async () => {
    stubBrowser({ languages: ['de'] });
    vi.stubGlobal('navigator', { languages: [], language: 'de-AT' });
    const i18n = await freshI18n();
    await i18n.init();
    expect(i18n.getLocale()).toBe('de');
  });

  it('still initialises when storage is unavailable', async () => {
    stubBrowser({ languages: ['de'] });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    const i18n = await freshI18n();
    await i18n.init();
    expect(i18n.getLocale()).toBe('de');
  });

  it('setLanguage stores a supported code and reloads', async () => {
    const { storage, reload } = stubBrowser();
    const i18n = await freshI18n();
    i18n.setLanguage('fr');
    expect(storage.get('bikebuddy-lang')).toBe('fr');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('setLanguage ignores an unsupported code', async () => {
    const { storage, reload } = stubBrowser();
    const i18n = await freshI18n();
    i18n.setLanguage('xx');
    expect(storage.has('bikebuddy-lang')).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('setLanguage still reloads when storage is unavailable', async () => {
    const { reload } = stubBrowser();
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const i18n = await freshI18n();
    i18n.setLanguage('de');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

// applyI18n only ever calls root.querySelectorAll and reads/writes attributes,
// so a stand-in is enough to pin which attributes it applies without a DOM.
// With no messages loaded, t() resolves a key to itself — that is the assertion
// handle: the key reaching the right attribute is what this guards.
describe('applyI18n', () => {
  let i18n;
  beforeEach(async () => {
    i18n = await freshI18n();
  });

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
    const elements = i18n.I18N_ATTRS.map((attr) => makeEl({ [`data-i18n-${attr}`]: `key.${attr}` }));

    i18n.applyI18n(makeRoot(elements));

    elements.forEach((el, i) => {
      expect(el.applied[i18n.I18N_ATTRS[i]]).toBe(`key.${i18n.I18N_ATTRS[i]}`);
    });
  });

  it('covers the multi-word attribute name', () => {
    expect(i18n.I18N_ATTRS).toContain('aria-label');
  });

  it('writes text and markup content to their own sinks', () => {
    const text = makeEl({ 'data-i18n': 'nav.upload' });
    const html = makeEl({ 'data-i18n-html': 'help.a2' });

    i18n.applyI18n(makeRoot([text, html]));

    expect(text.textContent).toBe('nav.upload');
    expect(html.innerHTML).toBe('help.a2');
    // Content sinks are assignments, never setAttribute.
    expect(text.applied).toEqual({});
    expect(html.applied).toEqual({});
  });
});
