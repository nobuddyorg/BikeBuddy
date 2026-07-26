'use strict';

// Lightweight, dependency-free i18n for the bundler-free frontend.
// Pure helpers (normalizeLocale / pickLocale / translate) are unit-tested; the
// runtime (init / applyI18n / setLanguage) is browser glue covered by e2e.

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

// The API answers validation failures with an i18n key rather than prose, so
// its wording is localised here rather than in the backend (#359). Everything
// else it returns is already a sentence and is passed through untouched — an
// unknown key resolves to itself, which is exactly that case.
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

// Attributes translated by data-i18n-<attr>. Adding one is a word here rather
// than a copied block; read via getAttribute so the kebab name is written once
// instead of also as its camelCase dataset spelling (#365).
export const I18N_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

// Apply translations to all [data-i18n*] elements under root. The two content
// sinks stay written out: they are assignments rather than setAttribute calls,
// and folding them in would bury the fact that data-i18n-html is the one that
// interprets markup.
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
