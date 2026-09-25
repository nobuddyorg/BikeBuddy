import { DEFAULT_LOCALE, isSupported, localeMeta, pickLocale, translate } from '../lib/i18n.js';

const STORAGE_KEY = 'bikebuddy-lang';

let messages = {};
let fallbackMessages = {};
let currentLocale = DEFAULT_LOCALE;

export function getLocale() {
  return currentLocale;
}

export function getLocaleMeta() {
  return localeMeta(currentLocale);
}

export function intlLocale() {
  return getLocaleMeta().intlLocale;
}

export function t(key, params) {
  return translate({ messages, fallbackMessages, key, params, locale: intlLocale() });
}

// The API sends an i18n key or an English sentence; a sentence resolves to itself.
export function tApi(message) {
  return t(message);
}

async function loadMessages(code) {
  const response = await fetch(`locales/${code}.json`);
  if (!response.ok) throw new Error(`Failed to load locale ${code}: ${response.status}`);
  return response.json();
}

async function loadMessagesOr({ code, fallback }) {
  try {
    return await loadMessages(code);
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

// English is always loaded too, as the per-key fallback.
export async function init() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode, site settings); fall back to the browser language.
  }
  currentLocale = pickLocale({
    stored,
    languages: navigator.languages?.length ? navigator.languages : [navigator.language],
  });

  fallbackMessages = await loadMessagesOr({ code: DEFAULT_LOCALE, fallback: {} });
  messages =
    currentLocale === DEFAULT_LOCALE
      ? fallbackMessages
      : await loadMessagesOr({ code: currentLocale, fallback: fallbackMessages });

  document.documentElement.lang = currentLocale;
  applyI18n(document);
  document.body.classList.remove('i18n-loading');
}

// Reloads, so every string re-renders, dynamic ones included.
export function setLanguage(code) {
  if (!isSupported(code)) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Storage can be blocked; the reload then shows the choice for this visit only.
  }
  location.reload();
}

// Read via getAttribute, so each name is written once rather than also in camelCase.
export const I18N_ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt'];

// The two content sinks stay separate, so it is plain which one interprets markup.
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach((element) => {
    element.innerHTML = t(element.getAttribute('data-i18n-html')); // nosemgrep: insecure-document-method, insecure-innerhtml -- the markup sink by design: data-i18n-html keys resolve to repo-owned locale strings, never user input
  });
  for (const attribute of I18N_ATTRIBUTES) {
    const source = `data-i18n-${attribute}`;
    root.querySelectorAll(`[${source}]`).forEach((element) => {
      element.setAttribute(attribute, t(element.getAttribute(source)));
    });
  }
}
