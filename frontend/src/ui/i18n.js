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

// The API sends either an i18n key or a finished English sentence; a sentence
// is not a key, so it resolves to itself.
export function tApi(message) {
  return t(message);
}

async function loadMessages(code) {
  const response = await fetch(`locales/${code}.json`);
  if (!response.ok) throw new Error(`Failed to load locale ${code}: ${response.status}`);
  return response.json();
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
  // Reveals the real markup — see the .i18n-loading skeleton rules in
  // style.css for why it starts hidden.
  document.body.classList.remove('i18n-loading');
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
// instead of also in its camelCase spelling.
export const I18N_ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt'];

// The two content sinks stay written out rather than joining the table above:
// folding them in would bury which of the two interprets markup.
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
