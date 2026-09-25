// @ts-check

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
/** @param {{ stored?: string | null, languages?: readonly string[], fallback?: string }} [options] */
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
// the wording lives here. Anything else it sends is already a sentence,
// and an unknown key resolving to itself passes it through unchanged.
export function translateApiMessage(messages, message, fallback = {}) {
  const translated = translate(messages, message, {}, fallback);
  return translated === message ? message : translated;
}
