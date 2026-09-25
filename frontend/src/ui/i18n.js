import { DEFAULT_LOCALE, isSupported, localeMeta, pickLocale, translate } from '../lib/i18n.js';
import { markupRuns } from '../lib/markup.js';
import { apiErrorParams } from '../lib/apiErrors.js';

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

// The API sends an i18n key (functions/src/lib/http.js); anything else resolves to itself.
export function tApi(message) {
  return t(message, apiErrorParams(message));
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

function markupNode({ kind, text }) {
  if (kind === 'text') return document.createTextNode(text);
  const element = document.createElement(kind === 'code' ? 'code' : 'strong');
  element.textContent = text;
  return element;
}

// Emphasis is built as elements from text runs, so no translation ever reaches an HTML parser.
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach((element) => {
    element.replaceChildren(
      ...markupRuns(t(element.getAttribute('data-i18n-html'))).map(markupNode),
    );
  });
  for (const attribute of I18N_ATTRIBUTES) {
    const source = `data-i18n-${attribute}`;
    root.querySelectorAll(`[${source}]`).forEach((element) => {
      element.setAttribute(attribute, t(element.getAttribute(source)));
    });
  }
}
