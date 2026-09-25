# How-to: Add a language

The frontend uses a small, dependency-free i18n engine: the pure lookup,
plural and interpolation logic in `frontend/src/lib/i18n.js`, the runtime
(loading the locale file, `t`, `tApi`, applying `data-i18n` attributes) in
`frontend/src/ui/i18n.js`. Adding a locale is two steps plus a test.

## 1. Add the translations

Copy the English locale and translate every value (keep the keys unchanged):

```bash
cp frontend/src/locales/en.json frontend/src/locales/<code>.json
```

`<code>` is the ISO 639-1 base language, e.g. `fr`. Keys are flat, dotted
strings; `{placeholders}` in a value must stay verbatim so interpolation works:

```json
{
  "nav.upload": "Importer GPX",
  "sidebar.pagerLabel": "Page {page} / {totalPages}"
}
```

Numbers passed as parameters are formatted for the locale (`1.234,5` in
German). A message that depends on a count has one key per plural category,
chosen with `Intl.PluralRules` from `params.count`, falling back to `.other`:

```json
{
  "toast.toursDeleted.one": "Sortie supprimée.",
  "toast.toursDeleted.other": "{count} sorties supprimées."
}
```

Add the categories your language needs (`few`, `many`, … per
`Intl.PluralRules`); `.one` and `.other` cover every current locale.

## 2. Register the locale

Add an entry to `SUPPORTED_LOCALES` in `frontend/src/lib/i18n.js`. That single
list drives the language switcher, browser-language detection, and number,
date and unit formatting — nothing else needs wiring:

```js
export const SUPPORTED_LOCALES = [
  // …
  {
    code: 'fr',
    label: 'Français',
    flag: '🇫🇷',
    short: 'FR',
    intlLocale: 'fr-FR',
  },
];
```

| Field        | Purpose                                      |
| ------------ | -------------------------------------------- |
| `code`       | Locale code; must match the JSON file name.  |
| `label`      | Name shown in the language menu.             |
| `flag`       | Emoji flag for the menu.                     |
| `short`      | Two-letter badge on the language button.     |
| `intlLocale` | BCP-47 tag passed to every `Intl` formatter. |

Some keys are also produced by the API: `TOUR_META_ERROR_KEYS` in
`functions/src/lib/validation.js` answers a failed validation with a key rather
than prose, which `tApi` then resolves. They are ordinary locale keys — the
parity test below covers them like any other.

## 3. Verify

The unit test enforces key parity and non-empty values across every locale in
`SUPPORTED_LOCALES`, so a missing or blank key fails the build:

```bash
cd frontend && npm test
```

Then start the app (`./buddy.sh development start-all`) and pick the new language
from the switcher (top right). The choice is stored in `localStorage`; on first
visit the app auto-selects a matching browser language, falling back to English.
