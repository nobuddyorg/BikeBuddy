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

Add an entry to `SUPPORTED_LOCALES` in `frontend/src/lib/i18n.js`. That list
drives the language switcher, browser-language detection, and number, date and
unit formatting. Two more lists name every language, and a test fails until all
three agree with the files in `frontend/src/locales/`:

- `SUPPORTED_LANGUAGE_CODES` in `functions/src/lib/validation.js`, or the API
  refuses to save the new language to a signed-in user's profile;
- `PRECACHE_URLS` in `frontend/src/sw.js` (`locales/<code>.json`), so the
  language also loads offline.

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

Some keys are also produced by the API: every error body is one of the
`ERROR_KEYS` in `functions/src/lib/http.js`, a key rather than prose, which
`tApi` then resolves (filling the limits it names from
`frontend/src/lib/apiErrors.js`). They are ordinary locale keys, which the
parity test below covers like any other.

## 3. Verify

The unit tests enforce key parity and non-empty values across every locale in
`SUPPORTED_LOCALES`, and that every API error key and all three language lists
match the locale files (`functions/test/unit/frontendContract.test.js`), so a
missing or blank key or a forgotten list fails the build:

```bash
./buddy.sh test frontend && ./buddy.sh test unit
```

Then start the app (`./buddy.sh development start-all`) and pick the new language
from the switcher (top right). The choice is stored in `localStorage`; on first
visit the app auto-selects a matching browser language, falling back to English.
