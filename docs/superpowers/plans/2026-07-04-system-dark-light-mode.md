# Dark and Light Mode from System Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site's colors and map basemap follow the OS `prefers-color-scheme` setting automatically, including live updates if the OS theme changes while the app is open.

**Architecture:** Split the existing hardcoded (dark) CSS custom-property palette in `frontend/src/style.css` into a light `:root` default plus a `@media (prefers-color-scheme: dark)` override. Separately, since Leaflet tile URLs are JS state, add a `matchMedia` listener in `frontend/src/app.js` that swaps the tile layer's URL between CARTO Voyager (light) and Dark Matter (dark) tile sets, both on load and on live OS-theme change.

**Tech Stack:** Same as the rest of the repo — plain CSS custom properties, plain ES modules, Leaflet (already loaded), Playwright for e2e (static UI, no backend needed since this is presentation-only).

## Global Constraints

- No manual override toggle or persisted preference — purely follows `prefers-color-scheme` (per spec, system-only).
- No change to heatmap gradient colors or the `rgba(0,0,0,...)` photo/tooltip overlay scrims — these are fixed-contrast overlays independent of site theme.
- `--color-primary` (`#f97316`), `--color-primary-hover` (`#ea6c0a`), and `--color-danger` (`#ef4444`) keep the same values in both palettes.
- Dark map tiles: `https://{s}.basemaps.cartocdn.com/rastertiles/dark_matter/{z}/{x}/{y}{r}.png`. Light map tiles (unchanged): `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`. Same `subdomains: 'abcd'`, `maxZoom: 19`, and attribution string for both.

---

## File Structure

- Modify `frontend/src/style.css` — replace the dark-only `:root` color block (lines 9-18) with a light-mode default plus a `@media (prefers-color-scheme: dark)` override block.
- Modify `frontend/src/app.js` — capture the tile layer in a variable, add `applyMapTheme(isDark)` and a `matchMedia` listener.
- Create `e2e/tests/theme.spec.ts` — static-UI Playwright coverage using `page.emulateMedia({ colorScheme })`.

---

### Task 1: Light/dark CSS palette

**Files:**

- Modify: `frontend/src/style.css:9-22`

**Interfaces:**

- Produces: no new interfaces — same `--color-*` custom property names, just palette-dependent values. Every other rule in the file already consumes these by name and needs no change.

- [ ] **Step 1: Replace the `:root` color block**

In `frontend/src/style.css`, replace lines 9-22:

```css
:root {
  --color-bg: #0f1117;
  --color-surface: #1a1d27;
  --color-surface-2: #22263a;
  --color-border: #2e3250;
  --color-primary: #f97316;
  --color-primary-hover: #ea6c0a;
  --color-text: #e2e8f0;
  --color-text-muted: #8892a4;
  --color-danger: #ef4444;
  --navbar-height: 56px;
  --sidebar-width: 280px;
  --detail-width: 320px;
}
```

with:

```css
:root {
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-surface-2: #f1f5f9;
  --color-border: #e2e8f0;
  --color-primary: #f97316;
  --color-primary-hover: #ea6c0a;
  --color-text: #1e293b;
  --color-text-muted: #64748b;
  --color-danger: #ef4444;
  --navbar-height: 56px;
  --sidebar-width: 280px;
  --detail-width: 320px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f1117;
    --color-surface: #1a1d27;
    --color-surface-2: #22263a;
    --color-border: #2e3250;
    --color-text: #e2e8f0;
    --color-text-muted: #8892a4;
  }
}
```

- [ ] **Step 2: Format and lint**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy
functions/node_modules/.bin/eslint --config functions/eslint.frontend.config.js frontend/src frontend/test
cd functions && npx prettier --check --config .prettierrc.json '../frontend/*.js' '../frontend/src/*.{js,css,html}' '../frontend/src/lib/**/*.js' '../frontend/test/**/*.js'
```

Expected: no errors from either command (CSS isn't linted by ESLint but must still pass Prettier's `--check`).

- [ ] **Step 3: Manual sanity check**

Open `frontend/src/index.html` directly in a browser (or via the SWA proxy), toggle the OS/browser color scheme (e.g. Chrome DevTools → Rendering tab → "Emulate CSS media feature prefers-color-scheme"), and confirm the background/surface/text colors switch between the light and dark values above. The map tiles will NOT switch yet — that's Task 2.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/style.css
git commit -m "feat: add light-mode palette, move dark palette behind prefers-color-scheme (#216)"
```

---

### Task 2: Map tiles follow system theme, live

**Files:**

- Modify: `frontend/src/app.js:39-46`

**Interfaces:**

- Consumes: nothing from Task 1 (independent file).
- Produces: no new exports — `applyMapTheme` and the `matchMedia` listener are internal to `app.js`, nothing else calls them.

- [ ] **Step 1: Capture the tile layer and add the theme switch**

In `frontend/src/app.js`, replace lines 39-46:

```js
const map = L.map('map', { center: [48.5, 10.5], zoom: 6 });

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);
```

with:

```js
const map = L.map('map', { center: [48.5, 10.5], zoom: 6 });

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_matter/{z}/{x}/{y}{r}.png',
};

const tileLayer = L.tileLayer(TILE_URLS.light, {
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

// Leaflet tile URLs are JS state (unlike the CSS palette, which the browser
// switches natively via prefers-color-scheme) — mirror the OS setting here so
// the basemap matches the rest of the UI, including live theme changes.
function applyMapTheme(isDark) {
  tileLayer.setUrl(isDark ? TILE_URLS.dark : TILE_URLS.light);
}

const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
applyMapTheme(darkMediaQuery.matches);
darkMediaQuery.addEventListener('change', (e) => applyMapTheme(e.matches));
```

- [ ] **Step 2: Format and lint**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy
functions/node_modules/.bin/eslint --config functions/eslint.frontend.config.js frontend/src frontend/test
cd functions && npx prettier --check --config .prettierrc.json '../frontend/*.js' '../frontend/src/*.{js,css,html}' '../frontend/src/lib/**/*.js' '../frontend/test/**/*.js'
```

Expected: no errors from either command.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app.js
git commit -m "feat: switch map tiles between light/dark basemap by system theme (#216)"
```

---

### Task 3: E2E coverage

**Files:**

- Create: `e2e/tests/theme.spec.ts`

**Interfaces:**

- Consumes: the real running app from Tasks 1-2 (static UI test — served via `e2e/serve.mjs`, no backend needed since devMode's synthetic local user makes the map/UI deterministic, same as `e2e/tests/app.spec.ts`).
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Write the test**

Create `e2e/tests/theme.spec.ts`:

```ts
import { buddyTest, expect } from '../pages/buddy-test';

// #216: site chrome and map tiles follow the OS prefers-color-scheme setting,
// including live updates if the OS theme changes mid-session. These run
// against the static frontend (no backend) since theming is presentation-only.

buddyTest.describe('system dark/light mode', () => {
  buddyTest('light OS preference renders the light palette and Voyager tiles', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(248, 250, 252)');

    const tileSrc = await page.locator('.leaflet-tile').first().getAttribute('src');
    expect(tileSrc).toContain('voyager');
  });

  buddyTest(
    'dark OS preference renders the dark palette and Dark Matter tiles',
    async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/');

      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe('rgb(15, 17, 23)');

      const tileSrc = await page.locator('.leaflet-tile').first().getAttribute('src');
      expect(tileSrc).toContain('dark_matter');
    },
  );

  buddyTest('switching the OS theme live updates both CSS and map tiles', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /voyager/);

    await page.emulateMedia({ colorScheme: 'dark' });

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(15, 17, 23)');
    await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /dark_matter/);
  });
});
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd e2e && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the test**

Run: `cd e2e && npm test -- theme.spec.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/theme.spec.ts
git commit -m "test(e2e): cover system dark/light mode for CSS and map tiles (#216)"
```

---

## Final verification

- [ ] `cd e2e && npm test` — full static UI suite passes, including the new `theme.spec.ts`.
- [ ] `prek run --all-files` (or on the changed files) — all hooks pass.
- [ ] Manual check in a real browser: toggle the OS appearance setting (or DevTools' `prefers-color-scheme` emulation) with the app open and confirm both the page chrome and the map basemap switch immediately, without a reload.
- [ ] Open a PR with `Fixes #216` in the body so it auto-closes on merge.
