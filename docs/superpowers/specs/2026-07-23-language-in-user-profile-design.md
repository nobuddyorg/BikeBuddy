# Language in user profile — design

**Issue:** [#290](https://github.com/nobuddyorg/BikeBuddy/issues/290)
**Status:** Approved, ready for implementation plan

## Problem

Language selection currently lives as a flag-dropdown in the navbar (`#lang-switcher`), stored only in `localStorage` (`bikebuddy-lang`) — it never touches the backend and doesn't sync across devices. The navbar also hides the "BikeBuddy" title below 768px width to make room for the switcher and other nav buttons. The issue asks to move language selection into user settings (persisted with user data) and keep the title visible on mobile.

## Goals

- Language preference persists on the backend user doc (Cosmos DB), like `name`/`email` already do, so a logged-in user's language follows them across devices.
- The language picker moves from the navbar into the profile settings modal.
- The "BikeBuddy" navbar title stays visible on mobile widths.

## Non-goals

- No manual language override for anonymous (logged-out) users — they keep the existing browser-detection fallback (`navigator.languages` → `en`), with no UI control, until they sign in.
- No silent migration of an existing anonymous `localStorage` value into the backend on first login — if a logged-in user has no saved backend language yet, their currently-applied locale is left as-is until they explicitly pick one in settings.
- No move away from the current full-page-reload mechanism for applying a language change (`setLanguage()`'s `localStorage.setItem` + `location.reload()` stays as the apply step).
- No new preferences container/endpoint — this is one field added to the existing user doc and existing `/api/me` endpoints.

## Design

### Data model & API

- `functions/src/lib/db.js` user doc gains an optional `language` field (string locale code, e.g. `"en"`, `"de"`). Cosmos is schemaless, so no migration step — absent means "not set yet."
- `functions/src/GetMe/index.js`: include `language` in the response JSON (omitted/`undefined` if not set).
- `functions/src/UpdateProfile/index.js`: extend `profileSchema` from `z.object({ name: nameSchema })` to `z.object({ name: nameSchema, language: languageSchema.optional() })`. `languageSchema` validates against the known supported locale codes — mirror the list already in `frontend/src/lib/i18n.js` as a small server-side constant (or validate as a 2-letter lowercase code against that same set). `name` stays required, unchanged; the frontend always sends the currently-known `name` alongside a language change so the existing contract for the name-save flow is untouched.

  **Superseded by the implementation plan:** the plan made `name` independently optional (alongside `language`, with a refine requiring at least one) instead — a brand-new user has no display name yet (self-service sign-up doesn't collect one) and must still be able to save a language preference without the PATCH failing on an empty name. The frontend sends `{ language: code }` alone, not `{ name, language }`. See `docs/superpowers/plans/2026-07-23-language-in-user-profile.md` Task 1.

- No new routes/files.

### Frontend flow

- **Move the picker**: relocate the `#lang-switcher` markup (button, search input, list) from `.navbar-actions` in `frontend/src/index.html` into `#profile-modal`, as its own field between the profile meta (`email`/`memberSince`) and the display-name form. Same markup and CSS classes, just repositioned in the DOM — IDs (`#btn-lang`, `#lang-menu`, `#lang-search`, `#lang-list`) don't change.
- **Wiring**: `setupLanguageSwitcher()` in `app.js` is invoked as part of profile-modal init instead of navbar init.
- **On selection** (immediate-apply, no separate "Save" button — matches current switcher behavior, distinct from the name field's explicit "Save name" button): send `PATCH /api/me` with `{ name: currentName, language: code }`. On success, call the existing `setLanguage(code)` (localStorage write + reload). On failure (e.g. offline), surface it via the existing profile error UI pattern and don't reload — the previously active language stays in effect.
- **Anonymous users**: no language control anywhere in the UI. `i18n.init()`'s existing `pickLocale()` fallback chain (`localStorage` → `navigator.languages` → `en`) is unchanged.
- **On login**: after `onAuthSuccess` / the `GetMe` call resolves, if `doc.language` is present and differs from the currently-applied locale, call `setLanguage(doc.language)` to reload and apply it. If `doc.language` is absent, leave the currently-applied locale untouched (no auto-migration) — the user sets their preference explicitly in settings from then on, which persists it going forward.
- **Removed**: the `#lang-switcher` div is removed entirely from `.navbar-actions`.

### Mobile title (CSS)

- Remove the mobile override in `frontend/src/style.css`: `@media (max-width: 768px) { .navbar-title { display: none; } }`. The title is visible at all widths.
- Removing the language switcher from `.navbar-actions` frees the space that rule was carving out for; no further layout rework is expected, but actual rendering at common mobile widths (e.g. 375px, 768px) should be sanity-checked during implementation with the `?`/upload/sign-in/profile buttons all present, tweaking spacing/font-size only if it visibly crowds.

## Testing plan

- Backend: extend the existing `UpdateProfile`/`GetMe` unit tests to cover `language` being accepted and returned, and rejected when the code isn't in the supported set.
- Frontend: existing i18n unit tests (`normalizeLocale`, `pickLocale`, etc.) are unaffected. If current tests cover `setupLanguageSwitcher()`'s DOM wiring, adjust for its new location; otherwise this part is UI-only and verified manually.
- Manual verification in-browser: anonymous browsing still auto-detects with no navbar control; logged-in flow (pick a language in settings → PATCH succeeds → reload → persists on a fresh login for the same account) works end-to-end; mobile title is visible at ≤768px without crowding the remaining nav buttons.
