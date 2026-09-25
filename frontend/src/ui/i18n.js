import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  isSupported,
  pickLocale,
  translate,
  translateApiMessage,
} from '../lib/i18n.js';

const STORAGE_KEY = 'bikebuddy-lang';

let messages = {};
let fallbackMessages = {};
let currentLocale = DEFAULT_LOCALE;

export function getLocale() {
  return currentLocale;
}

// currentLocale only ever holds a supported code (pickLocale / DEFAULT_LOCALE).
export function getLocaleMeta() {
  return /** @type {(typeof SUPPORTED_LOCALES)[number]} */ (
    SUPPORTED_LOCALES.find((l) => l.code === currentLocale)
  );
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
export const I18N_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

// The two content sinks stay written out rather than joining the table above:
// folding them in would bury which of the two interprets markup.
export function applyI18n(root = document) {
  /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-i18n]')).forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-i18n-html]')).forEach(
    (el) => {
      el.innerHTML = t(el.dataset.i18nHtml); // nosemgrep: insecure-document-method, insecure-innerhtml -- the markup sink by design: data-i18n-html keys resolve to repo-owned locale strings, never user input
    },
  );
  for (const attr of I18N_ATTRS) {
    const dataAttr = `data-i18n-${attr}`;
    root.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
      el.setAttribute(attr, t(el.getAttribute(dataAttr)));
    });
  }
}
