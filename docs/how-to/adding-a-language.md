# How-to: Add a language

The frontend uses a small, dependency-free i18n engine
(`frontend/src/lib/i18n.js`). Adding a locale is two steps plus a test.

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

## 2. Register the locale

Add an entry to `SUPPORTED_LOCALES` in `frontend/src/lib/i18n.js`. That single
list drives the language switcher, browser-language detection, and date
formatting — nothing else needs wiring:

```js
export const SUPPORTED_LOCALES = [
  // …
  {
    code: 'fr',
    label: 'Français',
    flag: '🇫🇷',
    short: 'FR',
    dateLocale: 'fr-FR',
  },
];
```

| Field        | Purpose                                           |
| ------------ | ------------------------------------------------- |
| `code`       | Locale code; must match the JSON file name.       |
| `label`      | Name shown in the language menu.                  |
| `flag`       | Emoji flag for the menu.                          |
| `short`      | Two-letter badge on the language button.          |
| `dateLocale` | BCP-47 tag passed to `Intl` for formatting dates. |

## 3. Verify

The unit test enforces key parity and non-empty values across every locale in
`SUPPORTED_LOCALES`, so a missing or blank key fails the build:

```bash
cd frontend && npm test
```

Then start the app (`./buddy.sh development start-all`) and pick the new language
from the switcher (top right). The choice is stored in `localStorage`; on first
visit the app auto-selects a matching browser language, falling back to English.
