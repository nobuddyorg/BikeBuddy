# Design: Screenshots, doc currency pass, help-modal rewrite, docs cleanup (#269)

## Goal

Issue #269 asks for four things: app screenshots for docs, a Diataxis-perspective
review of the docs, a review of the in-app help text, and removal of clutter
from `docs/`. This spec covers all four as one ticket.

## 1. Screenshots

Run the local dev stack (`./buddy.sh development start-all`), seed one or two
sample tours (existing e2e GPX fixtures), and use Playwright to capture:

| Screenshot                      | File                                       | Used in                               |
| ------------------------------- | ------------------------------------------ | ------------------------------------- |
| Main map with heatmap + sidebar | `docs/assets/screenshots/map-overview.png` | README (hero), docs/README.md         |
| Upload modal mid-flow           | `docs/assets/screenshots/upload-tour.png`  | `tutorials/getting-started.md` step 3 |
| Tour detail panel with photos   | `docs/assets/screenshots/tour-detail.png`  | `how-to/user-guide.md` Photos section |

Captured at desktop width, light theme (`prefers-color-scheme: light` emulated
in Playwright) for visual consistency. No dark-mode or mobile variants for
this pass — README/tutorial/guide screenshots optimize for a first-time
visitor skimming, not full feature coverage.

## 2. Diataxis doc review

Architecture, developer-guide, configuration, infrastructure, and explanation
docs were reviewed and are current — no changes needed there.

`docs/how-to/user-guide.md` predates three shipped features. Add short
sections for:

- **Filter to what's on screen** — the "In view" sidebar checkbox.
- **Select and delete multiple tours** — the Select mode / multi-delete bar.
- **Switch language** — the profile language switcher (also mention
  export-data/delete-account briefly, since they live in the same modal and
  aren't documented anywhere else).

Insert the three screenshots at the README overview, the getting-started
upload step, and the user-guide photos section respectively.

## 3. In-app help modal — full rewrite

`frontend/src/index.html` help-modal markup + the `help.*` keys in
`frontend/src/locales/en.json` currently cover 5 topics and are missing the
same features as the user guide, plus mobile swipe gestures. Rewrite as a
tighter set of Q&A entries:

1. What is this? (unchanged)
2. Sign in & your account (sign-in, display name, language, export/delete data)
3. Upload a tour
4. Find your tours (search, sort, filter to view)
5. Select & delete multiple tours
6. Map & heatmap (focus a tour, Show All, photo pins)
7. Photos
8. On mobile (swipe right to delete, swipe left to view details)

Keep each answer to 1–2 sentences — it's a quick-reference modal, not the
full user guide.

**Locale parity:** a Vitest test enforces identical keys across all 7 locale
files (`en`, `de`, `es`, `fr`, `it`, `nl`, `pt`). Every new/changed `help.*`
key gets translated into all 7 — done by hand, matching each locale's
existing tone (the same terms used elsewhere in that locale file, e.g. its
existing translation of "Upload GPX", "Photo pins", etc.).

## 4. Docs folder cleanup

Delete the 22 pre-existing files under `docs/superpowers/plans/` and
`docs/superpowers/specs/` (leftover specs/plans from prior feature tickets —
internal working documents, not user-facing docs, and called out by the
issue as clutter). This ticket's own spec and implementation plan are added
fresh in the same PR, so `docs/superpowers/` ends the PR containing only
those two files. No change to where future tickets' specs/plans are saved —
per user decision, the existing brainstorming/writing-plans default (commit
to `docs/superpowers/`) stays as-is going forward.

## Out of scope

- Mobile/dark-mode screenshot variants.
- Any change to `docs/reference/*`, `docs/explanation/*`,
  `docs/how-to/developer-guide.md`, `docs/how-to/infrastructure.md`,
  `docs/how-to/adding-a-language.md` — reviewed, found current.
- Changing the brainstorming/writing-plans default save location.
