// @ts-check

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', flag: '🇬🇧', short: 'EN', intlLocale: 'en-GB' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', short: 'DE', intlLocale: 'de-DE' },
  { code: 'es', label: 'Español', flag: '🇪🇸', short: 'ES', intlLocale: 'es-ES' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', short: 'FR', intlLocale: 'fr-FR' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹', short: 'IT', intlLocale: 'it-IT' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱', short: 'NL', intlLocale: 'nl-NL' },
  { code: 'pt', label: 'Português', flag: '🇵🇹', short: 'PT', intlLocale: 'pt-PT' },
];

export const DEFAULT_LOCALE = 'en';

export function isSupported(code) {
  return SUPPORTED_LOCALES.some((locale) => locale.code === code);
}

export function localeMeta(code) {
  return SUPPORTED_LOCALES.find((locale) => locale.code === code) ?? SUPPORTED_LOCALES[0];
}

// 'de-DE' / 'DE' → 'de'; unsupported and empty candidates drop out.
export function supportedLocaleCodes(candidates) {
  return candidates
    .filter(Boolean)
    .map((candidate) => String(candidate).toLowerCase().split('-')[0])
    .filter(isSupported);
}

/** @param {{ stored?: string | null, languages?: readonly string[] }} preferences */
export function pickLocale({ stored, languages = [] }) {
  return supportedLocaleCodes([stored, ...languages])[0] ?? DEFAULT_LOCALE;
}

// A key with plural forms is stored as `key.one`, `key.other`, … and chosen by
// the `count` parameter; `other` covers any category a locale leaves out.
function candidateKeys({ key, params, locale }) {
  if (typeof params.count !== 'number') return [key];
  const category = new Intl.PluralRules(locale).select(params.count);
  return [`${key}.${category}`, `${key}.other`, key];
}

function lookUp({ tables, keys }) {
  for (const table of tables) {
    const found = keys.find((key) => key in table);
    if (found) return table[found];
  }
  return undefined;
}

function interpolate({ template, params, locale }) {
  const numberFormat = new Intl.NumberFormat(locale);
  return template.replace(/\{(\w+)\}/g, (placeholder, name) => {
    if (!(name in params)) return placeholder;
    const value = params[name];
    return typeof value === 'number' ? numberFormat.format(value) : String(value);
  });
}

// Falls back to English, then to the key itself.
export function translate({ messages, fallbackMessages = {}, key, params = {}, locale }) {
  const keys = candidateKeys({ key, params, locale });
  const template = lookUp({ tables: [messages, fallbackMessages], keys }) ?? key;
  return interpolate({ template, params, locale });
}
