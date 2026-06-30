'use strict';

// Lightweight, dependency-free i18n for the bundler-free frontend.
// Pure helpers (normalizeLocale / pickLocale / translate) are unit-tested; the
// runtime (init / applyI18n / setLanguage) is browser glue covered by e2e.

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', flag: '🇬🇧', short: 'EN', dateLocale: 'en-GB' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', short: 'DE', dateLocale: 'de-DE' },
  { code: 'es', label: 'Español', flag: '🇪🇸', short: 'ES', dateLocale: 'es-ES' },
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

// Active locale: explicit stored override → first matching browser language →
// fallback. Pure so it can be unit-tested without a browser.
export function pickLocale({ stored, languages = [], fallback = DEFAULT_LOCALE } = {}) {
  const fromStore = normalizeLocale(stored);
  if (fromStore) return fromStore;
  for (const lang of languages) {
    const match = normalizeLocale(lang);
    if (match) return match;
  }
  return fallback;
}

// Resolve a key against messages (then the English fallback, then the key
// itself) and interpolate {placeholders}.
export function translate(messages, key, params = {}, fallback = {}) {
  const raw = messages?.[key] ?? fallback?.[key] ?? key;
  return String(raw).replace(/\{(\w+)\}/g, (whole, name) =>
    name in params ? String(params[name]) : whole,
  );
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

async function loadMessages(code) {
  const res = await fetch(`locales/${code}.json`);
  if (!res.ok) throw new Error(`Failed to load locale ${code}: ${res.status}`);
  return res.json();
}

// Detect the locale, load its messages (+ English as a graceful fallback) and
// apply translations to the static markup.
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

// Persist the choice and reload so every string (static + dynamic) re-renders.
export function setLanguage(code) {
  if (!isSupported(code)) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage unavailable */
  }
  location.reload();
}

// Apply translations to all [data-i18n*] elements under root.
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });
  root.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    el.setAttribute('alt', t(el.dataset.i18nAlt));
  });
}
