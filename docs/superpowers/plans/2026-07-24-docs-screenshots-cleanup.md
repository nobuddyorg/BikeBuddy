# Docs Screenshots, Currency Pass, Help-Modal Rewrite & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #269 — add real app screenshots to the docs, bring `docs/how-to/user-guide.md` and the in-app help modal up to date with shipped features, and remove the 22 stale AI-planning files cluttering `docs/superpowers/`.

**Architecture:** No application architecture changes. This is a docs/content pass touching: (1) `docs/superpowers/` housekeeping, (2) the frontend's static help-modal markup and its 7 locale JSON files, (3) three new PNG screenshots captured from the running local dev stack via Playwright, (4) prose additions to three existing markdown docs.

**Tech Stack:** Playwright (browser automation, already a dev dependency via `e2e/`), the existing `buddy.sh` local dev stack (Cosmos emulator, Azurite, Functions, SWA CLI proxy), Vitest (`frontend/test/i18n.test.js` enforces locale key parity).

## Global Constraints

- One commit per task (per repo convention: `docs/screenshots-and-cleanup-269` branch, issue `#269` in every commit subject).
- Every new/changed `help.*` key must exist with a non-empty value in all 7 locale files (`en`, `de`, `es`, `fr`, `it`, `nl`, `pt`) — enforced by `frontend/test/i18n.test.js`.
- `{placeholders}` and inline HTML tags (`<strong>`, `<code>`) in translated strings must be preserved verbatim, matching the existing pattern in `frontend/src/locales/*.json`.
- Screenshots: desktop viewport, light theme (`prefers-color-scheme: light`), captured against the local dev stack (`http://localhost:4280`), saved as PNG under `docs/assets/screenshots/`.
- Don't touch `docs/reference/*`, `docs/explanation/*`, `docs/how-to/developer-guide.md`, `docs/how-to/infrastructure.md`, `docs/how-to/adding-a-language.md`, or the brainstorming/writing-plans default save location — reviewed in the spec and found current/out of scope.

---

### Task 1: Delete stale `docs/superpowers/` files

**Files:**

- Delete: all 11 files in `docs/superpowers/plans/` except none yet exist for this ticket (the ticket's own plan — this file — is added in the same commit, so it survives).
- Delete: all 11 files in `docs/superpowers/specs/` except `2026-07-24-docs-screenshots-cleanup-design.md` (this ticket's own spec, already committed).

**Interfaces:** None — pure file deletion, no code depends on these files.

- [ ] **Step 1: Delete the 11 stale plan files**

```bash
git rm \
  docs/superpowers/plans/2026-07-03-multi-image-upload.md \
  docs/superpowers/plans/2026-07-03-per-tour-image-limit.md \
  docs/superpowers/plans/2026-07-03-pin-fanout-zoom.md \
  docs/superpowers/plans/2026-07-04-system-dark-light-mode.md \
  docs/superpowers/plans/2026-07-04-tour-list-pagination.md \
  docs/superpowers/plans/2026-07-19-multi-select-delete.md \
  docs/superpowers/plans/2026-07-21-mobile-improvements.md \
  docs/superpowers/plans/2026-07-23-language-in-user-profile.md \
  docs/superpowers/plans/2026-07-23-swipe-delete-tour.md \
  docs/superpowers/plans/2026-07-24-fuzzy-search-highlight.md \
  docs/superpowers/plans/2026-07-24-select-tours-map.md
```

- [ ] **Step 2: Delete the 11 stale spec files**

```bash
git rm \
  docs/superpowers/specs/2026-07-03-multi-image-upload-design.md \
  docs/superpowers/specs/2026-07-03-per-tour-image-limit-design.md \
  docs/superpowers/specs/2026-07-03-pin-fanout-zoom-design.md \
  docs/superpowers/specs/2026-07-04-dark-light-mode-design.md \
  docs/superpowers/specs/2026-07-04-tour-list-pagination-design.md \
  docs/superpowers/specs/2026-07-19-multi-select-delete-design.md \
  docs/superpowers/specs/2026-07-21-mobile-improvements-design.md \
  docs/superpowers/specs/2026-07-23-language-in-user-profile-design.md \
  docs/superpowers/specs/2026-07-23-swipe-delete-tour-design.md \
  docs/superpowers/specs/2026-07-24-fuzzy-search-highlight-design.md \
  docs/superpowers/specs/2026-07-24-select-tours-map-design.md
```

- [ ] **Step 3: Verify only this ticket's files remain**

```bash
git ls-files docs/superpowers
```

Expected: exactly
`docs/superpowers/plans/2026-07-24-docs-screenshots-cleanup.md` (this file, added in
step 4) and `docs/superpowers/specs/2026-07-24-docs-screenshots-cleanup-design.md`
(already committed). Right after `git rm`, before this plan file is added, expect
only the spec file.

- [ ] **Step 4: Add this plan file and commit**

```bash
git add docs/superpowers/plans/2026-07-24-docs-screenshots-cleanup.md
git commit -m "docs: remove stale superpowers plans/specs clutter (#269)"
```

---

### Task 2: Rewrite the in-app help modal (all 7 locales)

**Files:**

- Modify: `frontend/src/index.html:284-325` (the `#help-modal` block)
- Modify: `frontend/src/locales/en.json:55-65` (the `help.*` keys)
- Modify: `frontend/src/locales/de.json:55-65`
- Modify: `frontend/src/locales/es.json:55-65`
- Modify: `frontend/src/locales/fr.json:55-65`
- Modify: `frontend/src/locales/it.json:55-65`
- Modify: `frontend/src/locales/nl.json:55-65`
- Modify: `frontend/src/locales/pt.json:55-65`
- Test: `frontend/test/i18n.test.js` (existing key-parity test, no changes needed to the test itself)

**Interfaces:**

- Consumes: nothing new — same `data-i18n` / `data-i18n-html` attribute pattern already used throughout `index.html` (see e.g. `upload.dropText` at index.html:447 for the `data-i18n-html` pattern).
- Produces: 8 help entries (`help.q1`..`help.q8` / `help.a1`..`help.a8`) plus `help.title`, replacing the previous 5. Nothing outside this task reads `help.*` keys.

- [ ] **Step 1: Replace the help-modal markup in `frontend/src/index.html`**

Replace the block currently at lines 299–323 (the eight lines from `<h3 data-i18n="help.q1">` through the closing `</p>` of `help.a5`) with:

```html
<h3 data-i18n="help.q1">🧭 What is this?</h3>
<p data-i18n="help.a1">
  Upload GPX tracks from your rides — cycling or motorcycling — and see them as an interactive
  heatmap. Warmer colours mean you rode there more often.
</p>
<h3 data-i18n="help.q2">🔑 Sign in & your account</h3>
<p data-i18n-html="help.a2">
  Sign in to upload tours and save them to your account. Your profile lets you set a display name,
  switch language, export your data, or delete your account.
</p>
<h3 data-i18n="help.q3">⬆️ Upload a tour</h3>
<p data-i18n-html="help.a3">
  Click <strong>Upload GPX</strong>, give it a name, and drop a <code>.gpx</code> file. It appears
  on the map straight away.
</p>
<h3 data-i18n="help.q4">🔍 Find your tours</h3>
<p data-i18n-html="help.a4">
  Use the search box to filter by name and the sort menu to order by date, name, or length. Toggle
  <strong>In view</strong> to show only tours visible on the current map.
</p>
<h3 data-i18n="help.q5">🗑️ Select & delete multiple</h3>
<p data-i18n-html="help.a5">
  Click <strong>Select</strong> in the sidebar to check off several tours and delete them together.
</p>
<h3 data-i18n="help.q6">🗺️ Map & heatmap</h3>
<p data-i18n-html="help.a6">
  Click a tour to focus it; <strong>Show All Tours</strong> brings back the combined heatmap. Warmer
  colours mean you rode there more often.
</p>
<h3 data-i18n="help.q7">📷 Photos & pins</h3>
<p data-i18n-html="help.a7">
  Open a tour to add, view, or delete photos. Toggle
  <strong>Photo pins</strong> on the map to show geotagged photos where they were taken.
</p>
<h3 data-i18n="help.q8">📱 On mobile</h3>
<p data-i18n="help.a8">Swipe a tour right to delete it, or left to open its details.</p>
```

Note `help.a2` and `help.a8` use `data-i18n-html`/`data-i18n` respectively — `a2` has
no markup in English but is still `data-i18n-html` for consistency since translations
render as plain text either way (the i18n engine treats both the same when there's no
markup); `a8` truly has no markup in any locale.

- [ ] **Step 2: Replace `help.*` in `frontend/src/locales/en.json` (lines 55–65)**

```json
  "help.title": "How to use BikeBuddy",
  "help.q1": "🧭 What is this?",
  "help.a1": "Upload GPX tracks from your rides — cycling or motorcycling — and see them as an interactive heatmap. Warmer colours mean you rode there more often.",
  "help.q2": "🔑 Sign in & your account",
  "help.a2": "Sign in to upload tours and save them to your account. Your profile lets you set a display name, switch language, export your data, or delete your account.",
  "help.q3": "⬆️ Upload a tour",
  "help.a3": "Click <strong>Upload GPX</strong>, give it a name, and drop a <code>.gpx</code> file. It appears on the map straight away.",
  "help.q4": "🔍 Find your tours",
  "help.a4": "Use the search box to filter by name and the sort menu to order by date, name, or length. Toggle <strong>In view</strong> to show only tours visible on the current map.",
  "help.q5": "🗑️ Select & delete multiple",
  "help.a5": "Click <strong>Select</strong> in the sidebar to check off several tours and delete them together.",
  "help.q6": "🗺️ Map & heatmap",
  "help.a6": "Click a tour to focus it; <strong>Show All Tours</strong> brings back the combined heatmap. Warmer colours mean you rode there more often.",
  "help.q7": "📷 Photos & pins",
  "help.a7": "Open a tour to add, view, or delete photos. Toggle <strong>Photo pins</strong> on the map to show geotagged photos where they were taken.",
  "help.q8": "📱 On mobile",
  "help.a8": "Swipe a tour right to delete it, or left to open its details.",
```

- [ ] **Step 3: Replace `help.*` in `frontend/src/locales/de.json` (lines 55–65)**

```json
  "help.title": "So funktioniert BikeBuddy",
  "help.q1": "🧭 Was ist das?",
  "help.a1": "Lade GPX-Tracks deiner Touren hoch – ob Fahrrad oder Motorrad – und sieh sie als interaktive Heatmap. Wärmere Farben bedeuten, dass du dort öfter unterwegs warst.",
  "help.q2": "🔑 Anmelden & dein Konto",
  "help.a2": "Melde dich an, um Touren hochzuladen und in deinem Konto zu speichern. In deinem Profil kannst du einen Anzeigenamen setzen, die Sprache wechseln, deine Daten exportieren oder dein Konto löschen.",
  "help.q3": "⬆️ Tour hochladen",
  "help.a3": "Klicke auf <strong>GPX hochladen</strong>, gib einen Namen ein und lege eine <code>.gpx</code>-Datei ab. Sie erscheint sofort auf der Karte.",
  "help.q4": "🔍 Deine Touren finden",
  "help.a4": "Nutze die Suche zum Filtern nach Namen und das Sortiermenü, um nach Datum, Name oder Länge zu ordnen. Schalte <strong>Im Blick</strong> ein, um nur Touren zu zeigen, die auf der aktuellen Karte sichtbar sind.",
  "help.q5": "🗑️ Mehrere auswählen & löschen",
  "help.a5": "Klicke in der Seitenleiste auf <strong>Auswählen</strong>, um mehrere Touren anzuhaken und gemeinsam zu löschen.",
  "help.q6": "🗺️ Karte & Heatmap",
  "help.a6": "Klicke eine Tour an, um sie hervorzuheben; <strong>Alle Touren anzeigen</strong> bringt die kombinierte Heatmap zurück. Wärmere Farben bedeuten, dass du dort öfter unterwegs warst.",
  "help.q7": "📷 Fotos & Pins",
  "help.a7": "Öffne eine Tour, um Fotos hinzuzufügen, anzusehen oder zu löschen. Schalte <strong>Foto-Pins</strong> auf der Karte ein, um Geotag-Fotos dort zu zeigen, wo sie aufgenommen wurden.",
  "help.q8": "📱 Am Handy",
  "help.a8": "Wische eine Tour nach rechts, um sie zu löschen, oder nach links, um ihre Details zu öffnen.",
```

- [ ] **Step 4: Replace `help.*` in `frontend/src/locales/es.json` (lines 55–65)**

```json
  "help.title": "Cómo usar BikeBuddy",
  "help.q1": "🧭 ¿Qué es esto?",
  "help.a1": "Sube tracks GPX de tus rutas —en bici o en moto— y visualízalas como un mapa de calor interactivo. Los colores más cálidos indican que pasaste por allí más a menudo.",
  "help.q2": "🔑 Iniciar sesión y tu cuenta",
  "help.a2": "Inicia sesión para subir rutas y guardarlas en tu cuenta. En tu perfil puedes establecer un nombre visible, cambiar el idioma, exportar tus datos o eliminar tu cuenta.",
  "help.q3": "⬆️ Subir una ruta",
  "help.a3": "Haz clic en <strong>Subir GPX</strong>, ponle un nombre y suelta un archivo <code>.gpx</code>. Aparece en el mapa al instante.",
  "help.q4": "🔍 Encuentra tus rutas",
  "help.a4": "Usa el buscador para filtrar por nombre y el menú de orden para ordenar por fecha, nombre o longitud. Activa <strong>En vista</strong> para mostrar solo las rutas visibles en el mapa actual.",
  "help.q5": "🗑️ Seleccionar y eliminar varias",
  "help.a5": "Haz clic en <strong>Seleccionar</strong> en la barra lateral para marcar varias rutas y eliminarlas juntas.",
  "help.q6": "🗺️ Mapa y mapa de calor",
  "help.a6": "Haz clic en una ruta para enfocarla; <strong>Mostrar todas las rutas</strong> recupera el mapa de calor combinado. Los colores más cálidos indican que pasaste por allí más a menudo.",
  "help.q7": "📷 Fotos y pines",
  "help.a7": "Abre una ruta para añadir, ver o eliminar fotos. Activa <strong>Pines de fotos</strong> en el mapa para mostrar las fotos geolocalizadas donde se tomaron.",
  "help.q8": "📱 En el móvil",
  "help.a8": "Desliza una ruta hacia la derecha para eliminarla, o hacia la izquierda para abrir sus detalles.",
```

- [ ] **Step 5: Replace `help.*` in `frontend/src/locales/fr.json` (lines 55–65)**

```json
  "help.title": "Comment utiliser BikeBuddy",
  "help.q1": "🧭 Qu'est-ce que c'est ?",
  "help.a1": "Importe les traces GPX de tes sorties — à vélo ou à moto — et visualise-les sous forme de carte de chaleur interactive. Les couleurs les plus chaudes indiquent les endroits où tu es passé le plus souvent.",
  "help.q2": "🔑 Se connecter et ton compte",
  "help.a2": "Connecte-toi pour importer des sorties et les enregistrer sur ton compte. Ton profil te permet de définir un nom affiché, changer de langue, exporter tes données ou supprimer ton compte.",
  "help.q3": "⬆️ Importer une sortie",
  "help.a3": "Clique sur <strong>Importer GPX</strong>, donne-lui un nom et dépose un fichier <code>.gpx</code>. Elle apparaît aussitôt sur la carte.",
  "help.q4": "🔍 Retrouver tes sorties",
  "help.a4": "Utilise la recherche pour filtrer par nom et le menu de tri pour trier par date, nom ou distance. Active <strong>En vue</strong> pour n'afficher que les sorties visibles sur la carte actuelle.",
  "help.q5": "🗑️ Sélectionner et supprimer plusieurs sorties",
  "help.a5": "Clique sur <strong>Sélectionner</strong> dans la barre latérale pour cocher plusieurs sorties et les supprimer ensemble.",
  "help.q6": "🗺️ Carte et carte de chaleur",
  "help.a6": "Clique sur une sortie pour la mettre en avant ; <strong>Afficher toutes les sorties</strong> restaure la carte de chaleur combinée. Les couleurs les plus chaudes indiquent les endroits où tu es passé le plus souvent.",
  "help.q7": "📷 Photos et repères",
  "help.a7": "Ouvre une sortie pour ajouter, voir ou supprimer des photos. Active les <strong>Repères photo</strong> sur la carte pour afficher les photos géolocalisées à l'endroit où elles ont été prises.",
  "help.q8": "📱 Sur mobile",
  "help.a8": "Fais glisser une sortie vers la droite pour la supprimer, ou vers la gauche pour ouvrir ses détails.",
```

- [ ] **Step 6: Replace `help.*` in `frontend/src/locales/it.json` (lines 55–65)**

```json
  "help.title": "Come usare BikeBuddy",
  "help.q1": "🧭 Cos'è questo?",
  "help.a1": "Carica le tracce GPX dei tuoi giri — in bici o in moto — e visualizzale come una mappa di calore interattiva. I colori più caldi indicano i punti in cui sei passato più spesso.",
  "help.q2": "🔑 Accedi e il tuo account",
  "help.a2": "Accedi per caricare i giri e salvarli nel tuo account. Nel tuo profilo puoi impostare un nome visualizzato, cambiare lingua, esportare i tuoi dati o eliminare il tuo account.",
  "help.q3": "⬆️ Carica un giro",
  "help.a3": "Clicca su <strong>Carica GPX</strong>, dagli un nome e trascina un file <code>.gpx</code>. Appare subito sulla mappa.",
  "help.q4": "🔍 Trova i tuoi giri",
  "help.a4": "Usa la ricerca per filtrare per nome e il menu di ordinamento per ordinare per data, nome o lunghezza. Attiva <strong>In vista</strong> per mostrare solo i giri visibili sulla mappa attuale.",
  "help.q5": "🗑️ Seleziona ed elimina più giri",
  "help.a5": "Clicca su <strong>Seleziona</strong> nella barra laterale per selezionare più giri ed eliminarli insieme.",
  "help.q6": "🗺️ Mappa e mappa di calore",
  "help.a6": "Clicca su un giro per metterlo in evidenza; <strong>Mostra tutti i giri</strong> ripristina la mappa di calore combinata. I colori più caldi indicano i punti in cui sei passato più spesso.",
  "help.q7": "📷 Foto e indicatori",
  "help.a7": "Apri un giro per aggiungere, visualizzare o eliminare foto. Attiva gli <strong>Indicatori foto</strong> sulla mappa per mostrare le foto geolocalizzate nel punto in cui sono state scattate.",
  "help.q8": "📱 Su mobile",
  "help.a8": "Scorri un giro verso destra per eliminarlo, o verso sinistra per aprirne i dettagli.",
```

- [ ] **Step 7: Replace `help.*` in `frontend/src/locales/nl.json` (lines 55–65)**

```json
  "help.title": "Zo gebruik je BikeBuddy",
  "help.q1": "🧭 Wat is dit?",
  "help.a1": "Upload GPX-tracks van je ritten — fietsen of motorrijden — en bekijk ze als een interactieve heatmap. Warmere kleuren betekenen dat je daar vaker hebt gereden.",
  "help.q2": "🔑 Inloggen & je account",
  "help.a2": "Log in om ritten te uploaden en op te slaan in je account. In je profiel kun je een weergavenaam instellen, van taal wisselen, je gegevens exporteren of je account verwijderen.",
  "help.q3": "⬆️ Een rit uploaden",
  "help.a3": "Klik op <strong>GPX uploaden</strong>, geef een naam op en sleep een <code>.gpx</code>-bestand erin. Hij verschijnt direct op de kaart.",
  "help.q4": "🔍 Je ritten terugvinden",
  "help.a4": "Gebruik het zoekveld om op naam te filteren en het sorteermenu om te sorteren op datum, naam of afstand. Schakel <strong>In beeld</strong> in om alleen ritten te tonen die op de huidige kaart zichtbaar zijn.",
  "help.q5": "🗑️ Meerdere selecteren & verwijderen",
  "help.a5": "Klik op <strong>Selecteren</strong> in de zijbalk om meerdere ritten aan te vinken en samen te verwijderen.",
  "help.q6": "🗺️ Kaart & heatmap",
  "help.a6": "Klik op een rit om die uit te lichten; <strong>Alle ritten tonen</strong> herstelt de gecombineerde heatmap. Warmere kleuren betekenen dat je daar vaker hebt gereden.",
  "help.q7": "📷 Foto's & pins",
  "help.a7": "Open een rit om foto's toe te voegen, te bekijken of te verwijderen. Schakel <strong>Foto-pins</strong> op de kaart in om foto's met geotag te tonen op de plek waar ze zijn genomen.",
  "help.q8": "📱 Op mobiel",
  "help.a8": "Swipe een rit naar rechts om die te verwijderen, of naar links om de details te openen.",
```

- [ ] **Step 8: Replace `help.*` in `frontend/src/locales/pt.json` (lines 55–65)**

```json
  "help.title": "Como usar o BikeBuddy",
  "help.q1": "🧭 O que é isto?",
  "help.a1": "Carrega as tuas rotas GPX — de bicicleta ou de mota — e vê-as como um mapa de calor interativo. Cores mais quentes significam que passaste por ali mais vezes.",
  "help.q2": "🔑 Iniciar sessão e a tua conta",
  "help.a2": "Inicia sessão para carregar percursos e guardá-los na tua conta. No teu perfil podes definir um nome apresentado, mudar de idioma, exportar os teus dados ou eliminar a tua conta.",
  "help.q3": "⬆️ Carregar um percurso",
  "help.a3": "Clica em <strong>Carregar GPX</strong>, dá-lhe um nome e arrasta um ficheiro <code>.gpx</code>. Aparece de imediato no mapa.",
  "help.q4": "🔍 Encontra os teus percursos",
  "help.a4": "Usa a pesquisa para filtrar por nome e o menu de ordenação para ordenar por data, nome ou distância. Ativa <strong>À vista</strong> para mostrar apenas os percursos visíveis no mapa atual.",
  "help.q5": "🗑️ Selecionar e eliminar vários",
  "help.a5": "Clica em <strong>Selecionar</strong> na barra lateral para assinalar vários percursos e eliminá-los em conjunto.",
  "help.q6": "🗺️ Mapa e mapa de calor",
  "help.a6": "Clica num percurso para o destacar; <strong>Mostrar todos os percursos</strong> restaura o mapa de calor combinado. Cores mais quentes significam que passaste por ali mais vezes.",
  "help.q7": "📷 Fotos e marcadores",
  "help.a7": "Abre um percurso para adicionar, ver ou eliminar fotos. Ativa os <strong>Marcadores de fotos</strong> no mapa para mostrar as fotos geolocalizadas no local onde foram tiradas.",
  "help.q8": "📱 No telemóvel",
  "help.a8": "Desliza um percurso para a direita para o eliminar, ou para a esquerda para abrir os detalhes.",
```

- [ ] **Step 9: Run the locale parity test**

```bash
cd frontend && npx vitest run test/i18n.test.js
```

Expected: PASS — `%s has exactly the same keys as en` passes for all 6 non-English
locales, and `every locale has non-empty string values` passes.

- [ ] **Step 10: Run the full frontend test suite**

```bash
cd frontend && npm test
```

Expected: PASS (no regressions from the markup/JSON changes).

- [ ] **Step 11: Format and commit**

```bash
npx prettier --write frontend/src/index.html frontend/src/locales/*.json
git add frontend/src/index.html frontend/src/locales/*.json
git commit -m "docs: rewrite in-app help modal for shipped features, all 7 locales (#269)"
```

---

### Task 3: Capture screenshots from the running app

**Files:**

- Create: `docs/assets/screenshots/map-overview.png`
- Create: `docs/assets/screenshots/upload-tour.png`
- Create: `docs/assets/screenshots/tour-detail.png`

**Interfaces:**

- Consumes: the local dev stack started by `./buddy.sh development start-all` at
  `http://localhost:4280`; Task 2's rewritten help modal is live but not screenshotted
  in this task.
- Produces: three PNG files consumed by Task 4's doc edits (exact paths above — Task 4
  references these filenames verbatim).

- [ ] **Step 1: Start the local dev stack**

```bash
./buddy.sh development start-all
```

Wait for it to report the app is reachable at `http://localhost:4280`. Leave it running
in the background for the rest of this task.

- [ ] **Step 2: Create a sample GPX fixture for the screenshot tour**

```bash
cat > /tmp/screenshot-tour.gpx <<'EOF'
<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Alpine Loop</name><time>2026-07-20T08:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1642" lon="11.6056"/>
    <trkpt lat="48.1660" lon="11.6090"/>
    <trkpt lat="48.1680" lon="11.6110"/>
    <trkpt lat="48.1700" lon="11.6100"/>
    <trkpt lat="48.1710" lon="11.6070"/>
    <trkpt lat="48.1705" lon="11.6030"/>
    <trkpt lat="48.1690" lon="11.6000"/>
    <trkpt lat="48.1670" lon="11.5990"/>
    <trkpt lat="48.1650" lon="11.6000"/>
    <trkpt lat="48.1635" lon="11.6020"/>
    <trkpt lat="48.1630" lon="11.6040"/>
    <trkpt lat="48.1642" lon="11.6056"/>
  </trkseg></trk>
</gpx>
EOF
```

Use the repo's `e2e/fixtures/sample.jpg` for the photo in Step 6 (no need to create it).

- [ ] **Step 3: Navigate to the app and force light theme**

Use the Playwright browser tools (already available in this environment):

1. `browser_navigate` to `http://localhost:4280`.
2. `browser_resize` to `1280x800`.
3. `browser_evaluate` with:

   ```js
   () => {
     const style = document.createElement('style');
     style.textContent = ':root { color-scheme: light !important; }';
     document.head.appendChild(style);
   };
   ```

   (The app already auto-signs-in as the local dev user — `devMode`/`SKIP_AUTH` per
   `docs/tutorials/getting-started.md` — no login step needed.)

- [ ] **Step 4: Upload the sample tour and screenshot the upload modal**

1. `browser_click` the element with id `btn-upload` ("Upload GPX").
2. `browser_file_upload` with `/tmp/screenshot-tour.gpx` on the file input (`#upload-file`).
3. `browser_type` "Alpine Loop" into `#upload-name` (or confirm it's already filled from
   the GPX metadata — the app pre-fills the name from the file).
4. Take the screenshot **before** clicking Upload, so the filled-in modal is visible:
   `browser_take_screenshot` → save as `docs/assets/screenshots/upload-tour.png`.
5. `browser_click` `#btn-submit-upload` to actually upload it.

- [ ] **Step 5: Screenshot the main map/heatmap view**

1. Wait for the upload to finish and the detail panel to close (or click the close
   button `#btn-close-detail` if it auto-opens).
2. Confirm the tour appears in the sidebar list and as a heatmap trail on the map.
3. `browser_take_screenshot` → save as `docs/assets/screenshots/map-overview.png`.

- [ ] **Step 6: Add a photo and screenshot the tour detail panel**

1. Click the tour in the sidebar to open its detail panel.
2. `browser_file_upload` with `e2e/fixtures/sample.jpg` on `#image-file`.
3. Wait for the thumbnail to appear in `#tour-image-grid`.
4. `browser_take_screenshot` scoped to `#detail-panel` (or full page if element
   screenshot isn't convenient) → save as `docs/assets/screenshots/tour-detail.png`.

- [ ] **Step 7: Clean up the sample tour**

1. Click `#btn-delete-tour` and confirm the deletion dialog.
2. Verify the tour no longer appears in the sidebar (keeps the local dev DB clean —
   not required for the screenshots but avoids confusing later manual testing).

- [ ] **Step 8: Stop the local dev stack**

```bash
# Ctrl-C the ./buddy.sh development start-all process, or:
./buddy.sh development stop-all
```

- [ ] **Step 9: Verify file sizes and commit**

```bash
ls -lh docs/assets/screenshots/
```

Expected: three PNGs, each well under 1 MB (resize/compress with `sips` or similar if
any file is unexpectedly large — a 1280×800 PNG screenshot of this UI should be in the
100–400 KB range).

```bash
git add docs/assets/screenshots/
git commit -m "docs: add app screenshots for README, tutorial, and user guide (#269)"
```

---

### Task 4: Update README, tutorial, and user guide with screenshots and current features

**Files:**

- Modify: `README.md`
- Modify: `docs/tutorials/getting-started.md`
- Modify: `docs/how-to/user-guide.md`

**Interfaces:**

- Consumes: the three PNG files from Task 3 (`docs/assets/screenshots/map-overview.png`,
  `upload-tour.png`, `tour-detail.png`).
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Add the hero screenshot to `README.md`**

Insert immediately after the `## Documentation` section's closing paragraph (the line
ending "Contributor conventions: [Contributing guide](CONTRIBUTING.md)."), before
`## Technology map`:

```markdown
## Screenshot

![BikeBuddy map view with a heatmap and tour sidebar](docs/assets/screenshots/map-overview.png)
```

- [ ] **Step 2: Add the upload screenshot to the tutorial**

In `docs/tutorials/getting-started.md`, in the "## 3. Upload your first tour" section,
after the numbered list (after "3. It appears in the sidebar and as a heatmap on the
map. Click it to focus, add photos, or edit it."), add:

```markdown
![Upload modal with a tour name and a .gpx file ready to upload](../assets/screenshots/upload-tour.png)
```

- [ ] **Step 3: Update `docs/how-to/user-guide.md` with current features and a screenshot**

Replace the file's content (lines 1–44) with the following, which adds three new
sections (**Your account**, **Filter to what's in view**, **Select and delete multiple
tours**) and the tour-detail screenshot in the Photos section:

```markdown
# How-to: Use BikeBuddy

Short, task-focused recipes. There's also an in-app **?** button (top right) with
a quick version of this.

## Sign in

Click **Sign In**. Signing in saves your tours to your account. (Locally the app
auto-signs-in as a dev user.)

## Your account

Click your avatar (top right) to open your account. From there you can set a
display name, switch the UI language, export your data, or delete your account
and all its data.

## Upload a tour

1. Click **Upload GPX**.
2. Enter a name (defaults to the file name) and an optional description.
3. Drop or choose a `.gpx` file (max 10 MB) and click **Upload**.

The tour appears in the sidebar and on the map; the view jumps to its heatmap.

## Find a tour

- **Search**: type in the sidebar search box — fuzzy matching on the tour name.
- **Sort**: use the dropdown — by date, name, or length, ascending or descending.

## Read the map

- The heatmap shows where you've ridden; warmer colours = more passes.
- Click a tour to focus it; **Show All Tours** restores the combined heatmap.
- Toggle **In view** (top right of the map) to show only the tours visible in
  the current map view — useful once you have tours from many different places
  and want the sidebar list to match what you're looking at.

## Photos

1. Open a tour (click it) to reveal the detail panel.
2. Drop or choose JPEG/PNG photos to attach them.
3. Click a thumbnail to view it full-size; the ✕ deletes it.

![Tour detail panel showing distance, date, and attached photos](../assets/screenshots/tour-detail.png)

## Photo pins

Toggle **Photo pins** (top right of the map, next to **In view**) to show
geotagged photos where they were taken. Photos taken at the same spot fan out
so each is clickable. Default off.

## Edit or delete a tour

Open a tour, then use **Edit** (name/description) or **Delete Tour** in the
detail panel.

## Select and delete multiple tours

Click **Select** in the sidebar to enter selection mode, check off the tours you
want to remove, then click **Delete** in the selection bar to remove them all at
once. **Cancel** exits selection mode without deleting anything.
```

- [ ] **Step 4: Verify markdown formatting**

```bash
npx prettier --check README.md docs/tutorials/getting-started.md docs/how-to/user-guide.md
```

Expected: PASS. If it fails, run with `--write` instead and re-check.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/tutorials/getting-started.md docs/how-to/user-guide.md
git commit -m "docs: add screenshots and document current features in README/tutorial/user guide (#269)"
```

---

## Final verification

- [ ] Run the full pre-commit gate once more over the whole branch:

```bash
git log --oneline main..HEAD
./buddy.sh quality hooks
```

Expected: all four commits present, all hooks pass (markdownlint, Prettier, the
i18n Vitest suite runs as part of `test frontend`/`quality hooks` if configured — if
not, re-run `cd frontend && npm test` directly to double check).
