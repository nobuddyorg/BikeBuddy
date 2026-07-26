'use strict';

// Dependency-free i18n. The pure helpers are unit-tested; the browser runtime
// below is covered by e2e.

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', flag: '🇬🇧', short: 'EN', dateLocale: 'en-GB' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', short: 'DE', dateLocale: 'de-DE' },
  { code: 'es', label: 'Español', flag: '🇪🇸', short: 'ES', dateLocale: 'es-ES' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', short: 'FR', dateLocale: 'fr-FR' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹', short: 'IT', dateLocale: 'it-IT' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱', short: 'NL', dateLocale: 'nl-NL' },
  { code: 'pt', label: 'Português', flag: '🇵🇹', short: 'PT', dateLocale: 'pt-PT' },
];

export const DEFAULT_LOCALE = 'en';
export const STORAGE_KEY = 'bikebuddy-lang';

export function isSupported(code) {
  return SUPPORTED_LOCALES.some((l) => l.code === code);
}

// 'de-DE' / 'DE' → 'de'; returns null when the language isn't supported.
export function normalizeLocale(raw) {
  if (!raw) return null;
  const base = String(raw).toLowerCase().split('-')[0];
  return isSupported(base) ? base : null;
}

// Stored override → first matching browser language → fallback.
export function pickLocale({ stored, languages = [], fallback = DEFAULT_LOCALE } = {}) {
  const fromStore = normalizeLocale(stored);
  if (fromStore) return fromStore;
  for (const lang of languages) {
    const match = normalizeLocale(lang);
    if (match) return match;
  }
  return fallback;
}

// Falls back to English, then to the key itself.
export function translate(messages, key, params = {}, fallback = {}) {
  const raw = messages?.[key] ?? fallback?.[key] ?? key;
  return String(raw).replace(/\{(\w+)\}/g, (whole, name) =>
    name in params ? String(params[name]) : whole,
  );
}

// The API answers validation failures with an i18n key rather than prose, so
// the wording lives here (#359). Anything else it sends is already a sentence,
// and an unknown key resolving to itself passes it through unchanged.
export function translateApiMessage(messages, message, fallback = {}) {
  const translated = translate(messages, message, {}, fallback);
  return translated === message ? message : translated;
}

// ── Browser runtime ──────────────────────────────────────────────────────────

let messages = {};
let fallbackMessages = {};
let currentLocale = DEFAULT_LOCALE;

export function getLocale() {
  return currentLocale;
}

export function getLocaleMeta() {
  return SUPPORTED_LOCALES.find((l) => l.code === currentLocale) || SUPPORTED_LOCALES[0];
}

export function dateLocale() {
  return getLocaleMeta().dateLocale;
}

export function t(key, params) {
  return translate(messages, key, params, fallbackMessages);
}

export function tApi(message) {
  return translateApiMessage(messages, message, fallbackMessages);
}

async function loadMessages(code) {
  const res = await fetch(`locales/${code}.json`);
  if (!res.ok) throw new Error(`Failed to load locale ${code}: ${res.status}`);
  return res.json();
}

// English is always loaded too, as the per-key fallback.
export async function init() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  currentLocale = pickLocale({
    stored,
    languages: navigator.languages?.length ? navigator.languages : [navigator.language],
  });

  if (currentLocale === DEFAULT_LOCALE) {
    messages = await loadMessages(DEFAULT_LOCALE).catch(() => ({}));
    fallbackMessages = messages;
  } else {
    fallbackMessages = await loadMessages(DEFAULT_LOCALE).catch(() => ({}));
    messages = await loadMessages(currentLocale).catch(() => fallbackMessages);
  }

  document.documentElement.lang = currentLocale;
  applyI18n(document);
}

// Reloads, so every string re-renders — dynamic ones included.
export function setLanguage(code) {
  if (!isSupported(code)) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage unavailable */
  }
  location.reload();
}

// Read via getAttribute rather than dataset, so each name is written once here
// instead of also in its camelCase spelling (#365).
export const I18N_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

// The two content sinks stay written out rather than joining the table above:
// folding them in would bury which of the two interprets markup.
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  for (const attr of I18N_ATTRS) {
    const dataAttr = `data-i18n-${attr}`;
    root.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
      el.setAttribute(attr, t(el.getAttribute(dataAttr)));
    });
  }
}
