# Language in User Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move language selection out of the navbar and into the profile settings modal, persisting it on the backend user doc, while keeping the "BikeBuddy" navbar title visible on mobile.

**Architecture:** Backend: add an optional `language` field to the Cosmos `users` doc, returned by `GET /api/me` and settable via `PATCH /api/me` (made independently optional from `name`, since new users may not have set a name yet). Frontend: relocate the existing flag-dropdown markup/JS from the navbar into the profile modal unchanged, wire its selection handler to PATCH the backend before applying (existing `localStorage` + reload mechanism), and sync the backend-saved language on every login. CSS: un-hide the mobile navbar title and simplify the dropdown's positioning now that it lives inside a centered modal instead of the fixed navbar.

**Tech Stack:** Vanilla JS frontend (no bundler/framework), Azure Functions (Node, `@azure/functions` v4 programming model) + Cosmos DB backend, Zod for request validation, Vitest for unit tests, Playwright for e2e (`e2e/tests` static-UI-only, `e2e/tests-fullstack` against the real Functions host + Cosmos emulator).

## Global Constraints

- Backend `PATCH /api/me` must keep working for name-only updates exactly as before (existing tests in `functions/src/UpdateProfile/index.test.js` must keep passing unmodified).
- No new npm dependencies.
- No new backend routes/files — extend `GetMe`/`UpdateProfile`.
- No silent migration of an existing anonymous `localStorage` language into the backend on first login (per approved spec) — backend value wins only when present; if absent, the currently active locale is left alone.
- Anonymous (logged-out) users get no manual language control anywhere in the UI — only browser-detection fallback.
- Language change keeps the existing full-page-reload apply mechanism (`i18n.setLanguage()`).
- Supported language codes are `en`, `de`, `es`, `fr`, `it`, `nl`, `pt` (must stay in sync between `frontend/src/lib/i18n.js`'s `SUPPORTED_LOCALES` and the new backend-side list — they're separate deployables with no shared module, so this is a manually-maintained invariant, called out in both places with a comment).

---

### Task 1: Backend — `language` field on `/api/me`

**Files:**

- Modify: `functions/src/lib/validation.js`
- Modify: `functions/src/UpdateProfile/index.js`
- Modify: `functions/src/GetMe/index.js`
- Test: `functions/src/lib/validation.test.js`
- Test: `functions/src/UpdateProfile/index.test.js`
- Test: `functions/src/GetMe/index.test.js`

**Interfaces:**

- Produces: `languageSchema` (Zod schema, exported from `functions/src/lib/validation.js`) and `SUPPORTED_LANGUAGE_CODES` (array of strings), for use by `UpdateProfile`.
- Produces: `PATCH /api/me` now accepts `{ name?: string, language?: string }` (at least one required) and `GET`/`PATCH /api/me` responses both include `language` (string or absent).

- [ ] **Step 1: Write failing tests for the new validation helper**

Add to `functions/src/lib/validation.test.js` (new `describe` block, after the existing `isImageContentType` block, before the closing `});` of the outer `describe`):

```javascript
describe('languageSchema', () => {
  it('accepts every supported language code', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(languageSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects an unsupported code', () => {
    expect(languageSchema.safeParse('xx').success).toBe(false);
    expect(languageSchema.safeParse('EN').success).toBe(false);
  });
});
```

Update the top import to also pull in the new exports:

```javascript
const {
  stripHtml,
  tourMetaSchema,
  isUuid,
  uuidParamError,
  isImageContentType,
  languageSchema,
  SUPPORTED_LANGUAGE_CODES,
} = require('./validation');
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `cd functions && npx vitest run src/lib/validation.test.js`
Expected: FAIL — `languageSchema`/`SUPPORTED_LANGUAGE_CODES` are `undefined` (not yet exported).

- [ ] **Step 3: Implement the validation helper**

In `functions/src/lib/validation.js`, add after the `UUID_RE`/`isUuid` block (before `isImageContentType`):

```javascript
// Must stay in sync with frontend/src/lib/i18n.js's SUPPORTED_LOCALES codes —
// separate deployables, no shared module, so this list is kept in step by hand.
const SUPPORTED_LANGUAGE_CODES = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt'];
const languageSchema = z.enum(SUPPORTED_LANGUAGE_CODES);
```

Update the `module.exports` block to include the two new names:

```javascript
module.exports = {
  stripHtml,
  nameSchema,
  tourMetaSchema,
  isUuid,
  uuidParamError,
  isImageContentType,
  languageSchema,
  SUPPORTED_LANGUAGE_CODES,
};
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `cd functions && npx vitest run src/lib/validation.test.js`
Expected: PASS

- [ ] **Step 5: Write failing tests for `PATCH /api/me` accepting language**

Add to `functions/src/UpdateProfile/index.test.js`, inside the existing `describe('PATCH /api/me', ...)` block, after the `'creates the doc when it does not exist yet'` test:

```javascript
it('updates the stored language and returns it, leaving name untouched', async () => {
  const c = makeContainer({ id: 'u1', name: 'Ada', email: 'ada@example.com', createdAt: 'x' });
  const res = await updateProfile(reqWith({ language: 'de' }), mockAuth, () => c.container);

  expect(res.status).toBe(200);
  expect(c.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'u1', name: 'Ada', language: 'de' }),
  );
  expect(res.jsonBody.language).toBe('de');
  expect(res.jsonBody.name).toBe('Ada');
});

it('rejects an unsupported language code', async () => {
  const c = makeContainer();
  const res = await updateProfile(reqWith({ language: 'xx' }), mockAuth, () => c.container);
  expect(res.status).toBe(400);
  expect(c.upsert).not.toHaveBeenCalled();
});

it('rejects a body with neither name nor language', async () => {
  const c = makeContainer();
  const res = await updateProfile(reqWith({}), mockAuth, () => c.container);
  expect(res.status).toBe(400);
  expect(c.upsert).not.toHaveBeenCalled();
});

it('creates the doc with a null name when only language is provided for a new user', async () => {
  const c = makeContainer(undefined);
  const res = await updateProfile(reqWith({ language: 'fr' }), mockAuth, () => c.container);

  expect(res.status).toBe(200);
  expect(c.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'u1', name: null, email: 'ada@example.com', language: 'fr' }),
  );
});
```

- [ ] **Step 6: Run the test file to confirm the new tests fail**

Run: `cd functions && npx vitest run src/UpdateProfile/index.test.js`
Expected: FAIL — the schema still requires `name`, so a language-only body 400s where the new tests expect it to succeed, and `res.jsonBody.language` is `undefined`.

- [ ] **Step 7: Implement the schema and handler changes**

In `functions/src/UpdateProfile/index.js`, replace the top of the file:

```javascript
'use strict';

const { app } = require('@azure/functions');
const { z } = require('zod');
const { authenticate } = require('../middleware/authMiddleware');
const { usersContainer, readItem } = require('../lib/db');
const { nameSchema, languageSchema } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');

// name and language are independently optional — a brand-new account has no
// name yet (External ID self-service sign-up doesn't reliably collect one),
// so a user must be able to save a language preference before ever setting
// a display name. At least one of the two must be present.
const profileSchema = z
  .object({ name: nameSchema.optional(), language: languageSchema.optional() })
  .refine((data) => data.name !== undefined || data.language !== undefined, {
    message: 'A name or a language is required.',
  });
```

Replace the body of `updateProfile` from the `parsed` check onward:

```javascript
const parsed = profileSchema.safeParse(body ?? {});
if (!parsed.success) {
  return error(400, 'A name (1–200 characters) or a supported language is required.');
}

const { userId, userEmail } = user;
const container = getContainer();

let doc = await readItem(container, userId, userId);
if (!doc) {
  doc = {
    id: userId,
    name: parsed.data.name ?? null,
    email: userEmail,
    createdAt: new Date().toISOString(),
  };
}
if (parsed.data.name !== undefined) doc.name = parsed.data.name;
if (parsed.data.language !== undefined) doc.language = parsed.data.language;
({ resource: doc } = await container.items.upsert(doc));

return {
  status: 200,
  jsonBody: {
    id: doc.id,
    name: doc.name,
    email: doc.email,
    createdAt: doc.createdAt,
    language: doc.language,
  },
};
```

(The rest of the file — the `app.http(...)` registration and `module.exports` — is unchanged.)

- [ ] **Step 8: Run the test file to confirm all tests pass**

Run: `cd functions && npx vitest run src/UpdateProfile/index.test.js`
Expected: PASS (all 9 tests, including the 4 new ones and the 5 pre-existing ones unmodified)

- [ ] **Step 9: Write a failing test for `GET /api/me` returning language**

Add to `functions/src/GetMe/index.test.js`, inside `describe('GET /api/me', ...)`, after the `'returns existing user document'` test:

```javascript
test('returns the language field when the stored doc has one', async () => {
  const withLanguage = { ...STORED_USER, language: 'de' };
  const container = makeContainer({
    item: vi.fn().mockReturnValue({ read: async () => ({ resource: withLanguage }) }),
  });
  const res = await getMe(req, mockAuth, () => container);

  expect(res.jsonBody.language).toBe('de');
});
```

- [ ] **Step 10: Run the test file to confirm it fails**

Run: `cd functions && npx vitest run src/GetMe/index.test.js`
Expected: FAIL — `res.jsonBody.language` is `undefined` because the handler doesn't return it yet.

- [ ] **Step 11: Implement the `GetMe` change**

In `functions/src/GetMe/index.js`, change the return statement:

```javascript
return {
  status: 200,
  jsonBody: {
    id: doc.id,
    name: doc.name,
    email: doc.email,
    createdAt: doc.createdAt,
    language: doc.language,
  },
};
```

- [ ] **Step 12: Run the test file to confirm all tests pass**

Run: `cd functions && npx vitest run src/GetMe/index.test.js`
Expected: PASS (all tests, including the pre-existing `toEqual(STORED_USER)` assertion — `STORED_USER` has no `language` key, and `toEqual` treats an `undefined`-valued property as equivalent to an absent one, so it still matches)

- [ ] **Step 13: Run the full backend test suite**

Run: `cd functions && npm test`
Expected: PASS, no regressions elsewhere.

- [ ] **Step 14: Commit**

```bash
git add functions/src/lib/validation.js functions/src/lib/validation.test.js \
  functions/src/UpdateProfile/index.js functions/src/UpdateProfile/index.test.js \
  functions/src/GetMe/index.js functions/src/GetMe/index.test.js
git commit -m "$(cat <<'EOF'
feat: persist language preference on the user doc (#290)

/api/me now accepts and returns an optional `language` field, saved
independently of `name` so a user without a display name yet can still
save a language preference.
EOF
)"
```

---

### Task 2: Frontend i18n — add/rename locale keys

**Files:**

- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/locales/de.json`
- Modify: `frontend/src/locales/es.json`
- Modify: `frontend/src/locales/fr.json`
- Modify: `frontend/src/locales/it.json`
- Modify: `frontend/src/locales/nl.json`
- Modify: `frontend/src/locales/pt.json`
- Test: `frontend/test/i18n.test.js` (pre-existing, no changes needed — run to verify)

**Interfaces:**

- Produces: i18n keys `profile.language` (new — the field label), `profile.langAria` (renamed from `nav.langAria`), `errors.saveLanguage` (new — PATCH failure message), for `data-i18n*` attributes and `t(...)` calls added in Task 3.

This task is mechanical data-file editing with no new pure logic, so there's no red/green cycle — edit all 7 files, then run the existing locale-integrity test suite to confirm nothing broke.

- [ ] **Step 1: Edit `en.json`**

Remove line `"nav.langAria": "Change language",` from the `nav.*` block (and the now-unneeded trailing context it sat in). Add `"profile.langAria"` and `"profile.language"` into the `profile.*` block, and `"errors.saveLanguage"` into the `errors.*` block:

```json
  "nav.helpAria": "Help",
  "nav.helpTitle": "How to use BikeBuddy",
  "nav.upload": "Upload GPX",
  "nav.uploadDisabledTitle": "Sign in to upload tours",
  "nav.signIn": "Sign In",
  "nav.signOut": "Sign Out",
  "nav.profileAria": "View profile",
```

```json
  "profile.title": "Account",
  "profile.email": "Email",
  "profile.memberSince": "Member since",
  "profile.displayName": "Display name",
  "profile.namePlaceholder": "Your name",
  "profile.saveName": "Save name",
  "profile.language": "Language",
  "profile.langAria": "Change language",
  "profile.exportData": "Export my data",
  "profile.deleteAccount": "Delete account",
  "profile.yourAccount": "Your account",
```

```json
  "errors.saveChanges": "Could not save changes.",
  "errors.saveName": "Could not save your name.",
  "errors.saveLanguage": "Could not save your language.",
```

- [ ] **Step 2: Edit `de.json`** (same structural change, German text)

```json
  "nav.helpAria": "Hilfe",
  "nav.helpTitle": "So funktioniert BikeBuddy",
  "nav.upload": "GPX hochladen",
  "nav.uploadDisabledTitle": "Zum Hochladen anmelden",
  "nav.signIn": "Anmelden",
  "nav.signOut": "Abmelden",
  "nav.profileAria": "Profil ansehen",
```

```json
  "profile.title": "Konto",
  "profile.email": "E-Mail",
  "profile.memberSince": "Mitglied seit",
  "profile.displayName": "Anzeigename",
  "profile.namePlaceholder": "Dein Name",
  "profile.saveName": "Namen speichern",
  "profile.language": "Sprache",
  "profile.langAria": "Sprache ändern",
  "profile.exportData": "Meine Daten exportieren",
  "profile.deleteAccount": "Konto löschen",
  "profile.yourAccount": "Dein Konto",
```

```json
  "errors.saveChanges": "Änderungen konnten nicht gespeichert werden.",
  "errors.saveName": "Name konnte nicht gespeichert werden.",
  "errors.saveLanguage": "Sprache konnte nicht gespeichert werden.",
```

- [ ] **Step 3: Edit `es.json`** (Spanish text)

```json
  "nav.helpAria": "Ayuda",
  "nav.helpTitle": "Cómo usar BikeBuddy",
  "nav.upload": "Subir GPX",
  "nav.uploadDisabledTitle": "Inicia sesión para subir rutas",
  "nav.signIn": "Iniciar sesión",
  "nav.signOut": "Cerrar sesión",
  "nav.profileAria": "Ver perfil",
```

```json
  "profile.title": "Cuenta",
  "profile.email": "Correo electrónico",
  "profile.memberSince": "Miembro desde",
  "profile.displayName": "Nombre visible",
  "profile.namePlaceholder": "Tu nombre",
  "profile.saveName": "Guardar nombre",
  "profile.language": "Idioma",
  "profile.langAria": "Cambiar idioma",
  "profile.exportData": "Exportar mis datos",
  "profile.deleteAccount": "Eliminar cuenta",
  "profile.yourAccount": "Tu cuenta",
```

```json
  "errors.saveChanges": "No se pudieron guardar los cambios.",
  "errors.saveName": "No se pudo guardar tu nombre.",
  "errors.saveLanguage": "No se pudo guardar tu idioma.",
```

- [ ] **Step 4: Edit `fr.json`** (French text)

```json
  "nav.helpAria": "Aide",
  "nav.helpTitle": "Comment utiliser BikeBuddy",
  "nav.upload": "Importer GPX",
  "nav.uploadDisabledTitle": "Connecte-toi pour importer des sorties",
  "nav.signIn": "Se connecter",
  "nav.signOut": "Se déconnecter",
  "nav.profileAria": "Voir le profil",
```

```json
  "profile.title": "Compte",
  "profile.email": "E-mail",
  "profile.memberSince": "Membre depuis",
  "profile.displayName": "Nom affiché",
  "profile.namePlaceholder": "Ton nom",
  "profile.saveName": "Enregistrer le nom",
  "profile.language": "Langue",
  "profile.langAria": "Changer de langue",
  "profile.exportData": "Exporter mes données",
  "profile.deleteAccount": "Supprimer le compte",
  "profile.yourAccount": "Ton compte",
```

```json
  "errors.saveChanges": "Impossible d'enregistrer les modifications.",
  "errors.saveName": "Impossible d'enregistrer ton nom.",
  "errors.saveLanguage": "Impossible d'enregistrer ta langue.",
```

- [ ] **Step 5: Edit `it.json`** (Italian text)

```json
  "nav.helpAria": "Aiuto",
  "nav.helpTitle": "Come usare BikeBuddy",
  "nav.upload": "Carica GPX",
  "nav.uploadDisabledTitle": "Accedi per caricare giri",
  "nav.signIn": "Accedi",
  "nav.signOut": "Esci",
  "nav.profileAria": "Visualizza profilo",
```

```json
  "profile.title": "Account",
  "profile.email": "E-mail",
  "profile.memberSince": "Membro dal",
  "profile.displayName": "Nome visualizzato",
  "profile.namePlaceholder": "Il tuo nome",
  "profile.saveName": "Salva nome",
  "profile.language": "Lingua",
  "profile.langAria": "Cambia lingua",
  "profile.exportData": "Esporta i miei dati",
  "profile.deleteAccount": "Elimina account",
  "profile.yourAccount": "Il tuo account",
```

```json
  "errors.saveChanges": "Impossibile salvare le modifiche.",
  "errors.saveName": "Impossibile salvare il tuo nome.",
  "errors.saveLanguage": "Impossibile salvare la tua lingua.",
```

- [ ] **Step 6: Edit `nl.json`** (Dutch text)

```json
  "nav.helpAria": "Help",
  "nav.helpTitle": "Zo gebruik je BikeBuddy",
  "nav.upload": "GPX uploaden",
  "nav.uploadDisabledTitle": "Log in om ritten te uploaden",
  "nav.signIn": "Inloggen",
  "nav.signOut": "Uitloggen",
  "nav.profileAria": "Profiel bekijken",
```

```json
  "profile.title": "Account",
  "profile.email": "E-mail",
  "profile.memberSince": "Lid sinds",
  "profile.displayName": "Weergavenaam",
  "profile.namePlaceholder": "Je naam",
  "profile.saveName": "Naam opslaan",
  "profile.language": "Taal",
  "profile.langAria": "Taal wijzigen",
  "profile.exportData": "Mijn gegevens exporteren",
  "profile.deleteAccount": "Account verwijderen",
  "profile.yourAccount": "Je account",
```

```json
  "errors.saveChanges": "Wijzigingen konden niet worden opgeslagen.",
  "errors.saveName": "Je naam kon niet worden opgeslagen.",
  "errors.saveLanguage": "Je taal kon niet worden opgeslagen.",
```

- [ ] **Step 7: Edit `pt.json`** (Portuguese text)

```json
  "nav.helpAria": "Ajuda",
  "nav.helpTitle": "Como usar o BikeBuddy",
  "nav.upload": "Carregar GPX",
  "nav.uploadDisabledTitle": "Inicia sessão para carregar percursos",
  "nav.signIn": "Iniciar sessão",
  "nav.signOut": "Terminar sessão",
  "nav.profileAria": "Ver perfil",
```

```json
  "profile.title": "Conta",
  "profile.email": "E-mail",
  "profile.memberSince": "Membro desde",
  "profile.displayName": "Nome apresentado",
  "profile.namePlaceholder": "O teu nome",
  "profile.saveName": "Guardar nome",
  "profile.language": "Idioma",
  "profile.langAria": "Mudar idioma",
  "profile.exportData": "Exportar os meus dados",
  "profile.deleteAccount": "Eliminar conta",
  "profile.yourAccount": "A tua conta",
```

```json
  "errors.saveChanges": "Não foi possível guardar as alterações.",
  "errors.saveName": "Não foi possível guardar o teu nome.",
  "errors.saveLanguage": "Não foi possível guardar o teu idioma.",
```

- [ ] **Step 8: Run the frontend unit tests to confirm all locale files still have matching keys**

Run: `cd frontend && npm test -- test/i18n.test.js`
Expected: PASS — the `'%s has exactly the same keys as en'` and `'every locale has non-empty string values'` tests confirm all 7 files were edited consistently.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/locales/*.json
git commit -m "$(cat <<'EOF'
feat: add profile.language i18n keys, rename nav.langAria (#290)

Prepares locale strings for the language picker's move from the navbar
into profile settings.
EOF
)"
```

---

### Task 3: Frontend markup + CSS — relocate the picker, keep the mobile title visible

**Files:**

- Modify: `frontend/src/index.html`
- Modify: `frontend/src/style.css`

**Interfaces:**

- Consumes: i18n keys `profile.language`, `profile.langAria` from Task 2.
- Produces: `#lang-switcher`/`#btn-lang`/`#lang-menu`/`#lang-search`/`#lang-list` now live inside `#profile-modal` (same element IDs, so Task 4's `app.js` wiring and Task 5's e2e locators need no ID changes — only their DOM location and the CSS moved).

No unit/integration test exists at this layer (pure markup/CSS); verification is a manual browser check plus the full e2e suite in Task 5, which exercises the moved markup end-to-end.

- [ ] **Step 1: Remove the language switcher from the navbar**

In `frontend/src/index.html`, delete this block from inside `.navbar-actions` (currently the first child, right after the opening `<div class="navbar-actions">` tag):

```html
<div id="lang-switcher" class="lang-switcher">
  <button
    id="btn-lang"
    class="btn btn-ghost lang-btn"
    aria-haspopup="listbox"
    aria-expanded="false"
    data-i18n-aria-label="nav.langAria"
  ></button>
  <div id="lang-menu" class="lang-menu hidden" role="dialog" aria-label="Language">
    <input
      id="lang-search"
      class="lang-search"
      type="search"
      autocomplete="off"
      data-i18n-placeholder="lang.searchPlaceholder"
      data-i18n-aria-label="lang.searchAria"
    />
    <ul id="lang-list" class="lang-list" role="listbox"></ul>
  </div>
</div>
```

`.navbar-actions` should now start directly with the `#btn-help` button.

- [ ] **Step 2: Add the language field into the profile modal**

In `frontend/src/index.html`, insert the following between the closing `</dl>` of `.profile-meta` and the opening `<form id="profile-name-form" ...>`:

```html
<div class="field">
  <span data-i18n="profile.language">Language</span>
  <div id="lang-switcher" class="lang-switcher">
    <button
      id="btn-lang"
      class="btn btn-ghost lang-btn"
      aria-haspopup="listbox"
      aria-expanded="false"
      data-i18n-aria-label="profile.langAria"
    ></button>
    <div id="lang-menu" class="lang-menu hidden" role="dialog" aria-label="Language">
      <input
        id="lang-search"
        class="lang-search"
        type="search"
        autocomplete="off"
        data-i18n-placeholder="lang.searchPlaceholder"
        data-i18n-aria-label="lang.searchAria"
      />
      <ul id="lang-list" class="lang-list" role="listbox"></ul>
    </div>
  </div>
</div>
```

(Note the `data-i18n-aria-label` now points at `profile.langAria`, matching Task 2's renamed key.)

- [ ] **Step 3: Keep the navbar title visible on mobile**

In `frontend/src/style.css`, inside the `@media (max-width: 768px)` block (around the existing `.navbar { padding: 0 12px; }` rule), delete the `.navbar-title` sub-rule:

```css
.navbar-title {
  display: none;
}
```

The rest of that media query block (`.app-layout`, `.sidebar`, `.sidebar-header`, `.tour-controls`, etc.) is unchanged.

- [ ] **Step 4: Simplify the language dropdown's CSS for its new home**

The dropdown was previously anchored to the navbar's right edge with a `240px` fixed width, plus a mobile-only override pinning it under the navbar because it would otherwise overflow the screen. Now that it's nested inside the centered, width-constrained `.modal`, one rule can handle every width. In `frontend/src/style.css`, replace:

```css
.lang-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 240px;
  padding: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  z-index: 1200;
}

/* The switcher sits mid-navbar, so the right-anchored dropdown overflows the
   left edge on narrow screens. Pin it to the viewport instead. (This override
   must live after the base rule above — media queries add no specificity, so
   source order breaks the tie.) */
@media (max-width: 768px) {
  .lang-menu {
    position: fixed;
    top: var(--navbar-height);
    left: 8px;
    right: 8px;
    width: auto;
  }
}
```

with:

```css
.lang-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  width: auto;
  padding: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  z-index: 1200;
}
```

(`left: 0; right: 0;` stretches the menu to the field's own width — the switcher now lives inside a `.field` block that already spans the modal's content width, matching the display-name input beside it — so it works identically at every viewport size without a mobile override.)

- [ ] **Step 5: Fix the now-stale comment on `.detail-panel`'s z-index**

The `.detail-panel` rule's z-index comment justifies staying below `.navbar` by referencing "the navbar's language dropdown," which no longer exists there. In `frontend/src/style.css`, replace:

```css
/* Must be above Leaflet's own controls (.leaflet-top/.leaflet-bottom,
       z-index 1000 — #map has no stacking context of its own, so that value
       competes directly here) or the map's +/- zoom buttons poke through.
       Must stay below .navbar (1100): the navbar's language dropdown is a
       descendant of .navbar's stacking context, so it can never outrank a
       sibling that sits above navbar's own z-index, regardless of the
       dropdown's own value. */
```

with:

```css
/* Must be above Leaflet's own controls (.leaflet-top/.leaflet-bottom,
       z-index 1000 — #map has no stacking context of its own, so that value
       competes directly here) or the map's +/- zoom buttons poke through.
       Must stay below .navbar (1100), which is fixed/always-visible. */
```

- [ ] **Step 6: Manual verification in a browser**

Run: `node e2e/serve.mjs` (the repo's existing dependency-free static server for `frontend/src`, defaults to port 4281)

Open `http://localhost:4281` and confirm:

- The navbar no longer shows a language flag/code button.
- The "BikeBuddy" title text is visible at a 375px-wide viewport (browser devtools device toolbar).
- No console errors on load.

(Full interactive behavior — opening the profile modal and using the picker — needs Task 4's JS wiring; this step only confirms markup/CSS placement is correct.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/index.html frontend/src/style.css
git commit -m "$(cat <<'EOF'
feat: move language picker into profile modal, show title on mobile (#290)

Markup/CSS only in this commit — app.js wiring follows next.
EOF
)"
```

---

### Task 4: Frontend app.js — wire the moved picker to the backend

**Files:**

- Modify: `frontend/src/app.js`

**Interfaces:**

- Consumes: `PATCH /api/me` accepting `{ language: string }` (Task 1), `errors.saveLanguage` i18n key (Task 2), moved markup with unchanged IDs (Task 3).
- Produces: `selectLanguage(code)` and `syncLanguageFromUser(user)` functions, called from `setupLanguageSwitcher()`, `refreshUser()`, and `devSignIn()`.

No dedicated frontend unit test exists for this browser-glue code (matches the existing pattern — `setupLanguageSwitcher`, `refreshUser`, etc. are all untested at the unit level, covered by e2e instead). Task 5's e2e tests are the verification for this task; this task's own manual step is a quick smoke check.

- [ ] **Step 1: Add the shared language-sync helper**

In `frontend/src/app.js`, right after the `SYNTHETIC_USER` constant (around line 204), add:

```javascript
// Backend is the source of truth for language once logged in. If it disagrees
// with the currently active locale, apply it (one reload). No migration the
// other way: a user with nothing saved yet keeps whatever's currently active
// until they explicitly pick one in settings (#290).
function syncLanguageFromUser(user) {
  if (user.language && user.language !== i18n.getLocale()) {
    i18n.setLanguage(user.language);
  }
}
```

- [ ] **Step 2: Call it from both login paths**

In `devSignIn()` (around line 213), add the call at the end:

```javascript
async function devSignIn() {
  try {
    const res = await fetch(`${API_BASE}/api/me`);
    state.user = res.ok ? await res.json() : SYNTHETIC_USER;
  } catch {
    state.user = SYNTHETIC_USER;
  }
  renderNavAuth();
  renderSidebar();
  loadTours();
  syncLanguageFromUser(state.user);
}
```

In `refreshUser()` (around line 330), add the call after `renderNavAuth()`:

```javascript
async function refreshUser() {
  try {
    const res = await apiFetch('/api/me');
    if (!res.ok) return;
    state.user = { ...state.user, ...(await res.json()) };
    renderNavAuth();
    syncLanguageFromUser(state.user);
  } catch {
    // network unavailable — keep token-derived values
  }
}
```

- [ ] **Step 3: Add the PATCH-then-apply handler**

In `frontend/src/app.js`, in the "Profile modal" section, right after `saveProfileName` (around line 1178), add:

```javascript
// Persist the chosen language to the user doc (PATCH /api/me) before applying
// it, so it's still set next time the user signs in anywhere. i18n.setLanguage
// writes localStorage and reloads, re-rendering every string.
async function selectLanguage(code) {
  try {
    const res = await apiFetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: code }),
    });
    if (!res.ok) {
      toast(parseErrorMessage(await res.text(), t('errors.saveLanguage')), 'error');
      return;
    }
    i18n.setLanguage(code);
  } catch {
    toast(t('errors.network'), 'error');
  }
}
```

- [ ] **Step 4: Wire the dropdown's option click to the new handler**

In `setupLanguageSwitcher()` (around line 1448), change:

```javascript
btn.addEventListener('click', () => i18n.setLanguage(loc.code));
```

to:

```javascript
btn.addEventListener('click', () => selectLanguage(loc.code));
```

- [ ] **Step 5: Manual smoke check**

Run: `cd frontend && npx http-server src -p 8080` (dev mode with no backend falls back to the synthetic user — good enough to confirm the picker still opens/searches/renders without throwing).

Open `http://localhost:8080`, sign in (auto-signs in in dev mode), open the profile modal (avatar button), confirm the language field renders with a flag button and the dropdown opens/searches as before. Selecting a language will fail the PATCH (no backend running) and show an error toast — that's expected here; full success-path verification happens against the real backend in Task 5.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app.js
git commit -m "$(cat <<'EOF'
feat: persist language selection to the backend on change/login (#290)

Selecting a language now PATCHes /api/me before applying it; logging in
anywhere re-applies the saved backend language if it differs from what's
currently active.
EOF
)"
```

---

### Task 5: E2E — move the language-switcher test to the fullstack suite, verify persistence

**Files:**

- Modify: `e2e/pages/main-page.ts`
- Modify: `e2e/pages/profile-modal.ts`
- Modify: `e2e/tests-fullstack/usersDb.ts`
- Modify: `e2e/tests/app.spec.ts`
- Create: `e2e/tests-fullstack/language.spec.ts`

**Interfaces:**

- Consumes: `on(page).main.do.openProfile()`, `on(page).modal.profile()` (existing), the moved `#lang-switcher` markup (Task 3), the backend `language` field (Task 1).
- Produces: `on(page).modal.profile.do.switchLanguage({ search, pick })`, `UserDoc.language` (optional field on the `usersDb.ts` type).

The static suite (`e2e/tests/`) runs against a plain file server with no backend — `devSignIn()` there falls back to a synthetic user with no real `/api/me`, so `selectLanguage()`'s PATCH would always fail. The language-switcher test must move to the fullstack suite, which runs the real Functions host + Cosmos emulator.

- [ ] **Step 1: Remove the language locators/interaction from `main-page.ts`**

In `e2e/pages/main-page.ts`, delete the `lang` block from the `MainPage` interface's `locators` type (around line 99-104):

```typescript
lang: {
  button: Locator;
  menu: Locator;
  search: Locator;
  options: Locator;
}
```

Delete the `lang` block from the `locators` object (around line 168-173):

```typescript
    lang: {
      button: page.locator('#btn-lang'),
      menu: page.locator('#lang-menu'),
      search: page.locator('#lang-search'),
      options: page.locator('.lang-option'),
    },
```

Delete the `switchLanguage` interaction (around line 287-291):

```typescript
    switchLanguage: async ({ search, pick }: { search: string; pick: string }) => {
      await locators.lang.button.click();
      await locators.lang.search.fill(search);
      await locators.lang.options.filter({ hasText: pick }).click();
    },
```

- [ ] **Step 2: Add the language locators/interaction to `profile-modal.ts`**

Replace the full contents of `e2e/pages/profile-modal.ts` with:

```typescript
import { Locator, Page } from '@playwright/test';

interface ProfileModal {
  /** Points to self (the modal dialog). */
  (): Locator;
  /** High-level interactions. */
  do: {
    setName(name: string): Promise<void>;
    saveName(): Promise<void>;
    switchLanguage(opts: { search: string; pick: string }): Promise<void>;
    exportData(): Promise<void>;
    deleteAccount(): Promise<void>;
    close(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    title: Locator;
    email: Locator;
    since: Locator;
    nameInput: Locator;
    lang: {
      button: Locator;
      menu: Locator;
      search: Locator;
      options: Locator;
    };
    buttons: {
      saveName: Locator;
      exportData: Locator;
      deleteAccount: Locator;
      close: Locator;
    };
  };
}

export function initProfileModal(page: Page): ProfileModal {
  const root = page.locator('#profile-modal');
  const locators = {
    title: page.locator('#profile-modal-title'),
    email: page.locator('#profile-email'),
    since: page.locator('#profile-since'),
    nameInput: page.locator('#profile-name-input'),
    lang: {
      button: page.locator('#btn-lang'),
      menu: page.locator('#lang-menu'),
      search: page.locator('#lang-search'),
      options: page.locator('.lang-option'),
    },
    buttons: {
      saveName: page.locator('#profile-name-form button[type="submit"]'),
      exportData: page.locator('#btn-export-data'),
      deleteAccount: page.locator('#btn-delete-account'),
      close: page.locator('#btn-close-profile'),
    },
  };
  const interactions = {
    setName: async (name: string) => locators.nameInput.fill(name),
    saveName: async () => locators.buttons.saveName.click(),
    switchLanguage: async ({ search, pick }: { search: string; pick: string }) => {
      await locators.lang.button.click();
      await locators.lang.search.fill(search);
      await locators.lang.options.filter({ hasText: pick }).click();
    },
    exportData: async () => locators.buttons.exportData.click(),
    deleteAccount: async () => {
      page.once('dialog', (d) => d.accept());
      await locators.buttons.deleteAccount.click();
    },
    close: async () => locators.buttons.close.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
```

- [ ] **Step 3: Add `language` to the `UserDoc` type**

In `e2e/tests-fullstack/usersDb.ts`, change:

```typescript
export interface UserDoc {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
}
```

to:

```typescript
export interface UserDoc {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  language?: string;
}
```

- [ ] **Step 4: Remove the old static test**

In `e2e/tests/app.spec.ts`, delete this test (currently the last one in the file, right before the closing `});` of the describe block):

```typescript
buddyTest('language switcher: search + select German translates the UI', async ({ on, page }) => {
  // Default is English (CI browser is en-US).
  await expect(on(page).main.locators.buttons.upload).toHaveText('Upload GPX');

  await on(page).main.do.switchLanguage({ search: 'deu', pick: 'Deutsch' });

  // Selecting persists the choice and reloads; the UI comes back in German.
  await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');
  await expect(page.getByText('Meine Touren')).toBeVisible();
});
```

- [ ] **Step 5: Add the new fullstack test**

Create `e2e/tests-fullstack/language.spec.ts`:

```typescript
import { buddyTest, expect } from '../pages/buddy-test';
import { clearUsers, listUsers } from './usersDb';

// Language selection lives in profile settings and persists to the user doc,
// unlike the old navbar-only, localStorage-only picker (#290).

buddyTest.describe('language preference', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
  });

  buddyTest(
    'switching language in settings persists it and translates the UI',
    async ({ on, page }) => {
      await page.goto('/');
      await expect(on(page).main.locators.buttons.upload).toHaveText('Upload GPX');

      await on(page).main.do.openProfile();
      await expect(on(page).modal.profile()).toBeVisible();
      await on(page).modal.profile.do.switchLanguage({ search: 'deu', pick: 'Deutsch' });

      // Selecting PATCHes /api/me and reloads; the UI comes back in German.
      await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');
      await expect(page.getByText('Meine Touren')).toBeVisible();

      const [user] = await listUsers();
      expect(user.language).toBe('de');
    },
  );

  buddyTest(
    'a fresh session with no local override picks up the saved backend language',
    async ({ on, page }) => {
      await page.goto('/');
      await on(page).main.do.openProfile();
      await on(page).modal.profile.do.switchLanguage({ search: 'deu', pick: 'Deutsch' });
      await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');

      // Simulate a different browser/device: no local override, but the
      // account still has the saved language.
      await page.evaluate(() => localStorage.removeItem('bikebuddy-lang'));
      await page.reload();

      // Momentarily falls back to browser detection, then devSignIn()'s
      // /api/me re-fetch sees the saved language and re-applies it.
      await expect(on(page).main.locators.buttons.upload).toHaveText('GPX hochladen');
    },
  );
});
```

- [ ] **Step 6: Type-check and format-check the e2e project**

`e2e/` has no ESLint setup (no config, no devDependency) — its only static checks are `tsc` and Prettier.

Run: `cd e2e && npx tsc --noEmit && npm run format:check`
Expected: PASS, no type or formatting errors.

- [ ] **Step 7: Run the static e2e suite (confirms the moved locators didn't break anything else there)**

Run: `cd e2e && npm test`
Expected: PASS — all remaining tests in `e2e/tests/app.spec.ts` (and the other static specs) still pass with the language test removed.

- [ ] **Step 8: Run the fullstack e2e suite**

This requires the Functions host + Cosmos emulator running locally (see the project's existing fullstack-test setup instructions/CI workflow for how `buddy.sh` or equivalent starts them). Once running:

Run: `cd e2e && npm run test:fullstack`
Expected: PASS — including both new tests in `language.spec.ts`, and `account.spec.ts`/`registration.spec.ts`/etc. unaffected.

- [ ] **Step 9: Commit**

```bash
git add e2e/pages/main-page.ts e2e/pages/profile-modal.ts e2e/tests-fullstack/usersDb.ts \
  e2e/tests/app.spec.ts e2e/tests-fullstack/language.spec.ts
git commit -m "$(cat <<'EOF'
test: move language-switcher e2e coverage to the fullstack suite (#290)

The picker now requires a real PATCH /api/me, so it can no longer be
exercised by the backend-less static suite. New fullstack test also
verifies backend persistence and the login-time sync behavior.
EOF
)"
```
