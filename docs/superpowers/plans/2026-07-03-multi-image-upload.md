# Multi-Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user select or drop multiple photos at once on a tour's detail panel, upload them with bounded concurrency, and see independent per-file progress/success/error state for each.

**Architecture:** Frontend-only change (no backend/API changes — `POST /api/tours/{tourId}/images` already accepts one file per request). The image dropzone's file input gains `multiple`; the single shared progress bar is replaced by per-file placeholder tiles inside the existing `#tour-image-grid`, driven through a small concurrency-limited upload pool that calls the existing single-image endpoint once per file.

**Tech Stack:** Plain ES modules (no bundler/framework), Vitest for `frontend/src/lib/*.js` unit tests, Playwright for `e2e/tests-fullstack/*.spec.ts` against a real local backend.

## Global Constraints

- No backend/API contract changes — issue #209 is explicit about this.
- No per-tour image-count limit — none exists today and this plan doesn't add one.
- Batch size cap: max 20 files per selection/drop (`MAX_IMAGE_BATCH`).
- Upload concurrency: max 3 files in flight at once.
- Pure logic (validation, concurrency pool) lives in `frontend/src/lib/*.js` and is Vitest-unit-tested; DOM/upload glue stays in `frontend/src/app.js` (per this repo's `frontend/vitest.config.js`, which runs tests under `environment: 'node'` — there is no DOM test environment, so `app.js` itself is covered by the Playwright e2e test in Task 5, not Vitest).
- i18n: every new user-facing string needs a key in all three locale files (`en.json`, `de.json`, `es.json`) — `frontend/test/i18n.test.js` asserts exact key parity across locales and will fail the build otherwise.
- ESLint (`eslint:recommended` + Node plugin) and Prettier (2-space, single quotes) run in `prek`; run `npm run lint`/`npm run format` (or trust the pre-commit hook) before each commit.

---

## File Structure

- Modify `frontend/src/lib/files.js` — add `MAX_IMAGE_BATCH` and `validateImageBatch`.
- Create `frontend/src/lib/concurrency.js` — add `runWithConcurrency`, the only new pure module.
- Modify `frontend/src/index.html` — `multiple` on `#image-file`; remove the now-unused shared `#image-progress` markup.
- Modify `frontend/src/style.css` — new `.image-tile-pending` / `.image-tile-error` styles.
- Modify `frontend/src/locales/{en,de,es}.json` — new `errors.tooManyImages`, `detail.retryPhotoAria`, `detail.dismissPhotoAria` keys.
- Modify `frontend/src/app.js` — generalize `wireDropzone`, remove `uploadImage`/shared progress refs, add `createPendingImageTile` + `uploadImages` (all in one task — see Task 4 note on why these aren't split further).
- Modify `frontend/test/files.test.js` — tests for `validateImageBatch`.
- Create `frontend/test/concurrency.test.js` — tests for `runWithConcurrency`.
- Modify `e2e/pages/main-page.ts` — extend `addImage` to accept multiple files, add pending/error tile locators and a retry/dismiss action.
- Modify `e2e/tests-fullstack/tours.spec.ts` — extend or add a multi-image upload scenario.

---

### Task 1: Batch-size validation (`lib/files.js`)

**Files:**

- Modify: `frontend/src/lib/files.js`
- Test: `frontend/test/files.test.js`

**Interfaces:**

- Produces: `export const MAX_IMAGE_BATCH = 20;` and `export function validateImageBatch(files: File[]): string | null` — returns the i18n key `'errors.tooManyImages'` when `files.length > MAX_IMAGE_BATCH`, else `null`. Consumed by Task 5's `uploadImages`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/test/files.test.js` (add `MAX_IMAGE_BATCH, validateImageBatch` to the existing import on line 7):

```js
import { describe, it, expect } from 'vitest';
import {
  isGpxFile,
  isImageFile,
  validateGpxUpload,
  validateImageUpload,
  validateImageBatch,
  MAX_UPLOAD_BYTES,
  MAX_IMAGE_BATCH,
} from '../src/lib/files.js';
```

Add this new `describe` block at the end of the file:

```js
describe('validateImageBatch', () => {
  it('returns null at or under the cap', () => {
    const files = Array.from({ length: MAX_IMAGE_BATCH }, (_, i) => file(`p${i}.jpg`));
    expect(validateImageBatch(files)).toBeNull();
  });

  it('returns the i18n key over the cap', () => {
    const files = Array.from({ length: MAX_IMAGE_BATCH + 1 }, (_, i) => file(`p${i}.jpg`));
    expect(validateImageBatch(files)).toBe('errors.tooManyImages');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/files.test.js`
Expected: FAIL — `validateImageBatch` is not exported / `MAX_IMAGE_BATCH` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/lib/files.js`, add after the existing `MAX_IMAGE_BYTES` export (line 7):

```js
export const MAX_IMAGE_BATCH = 20;
```

Add after `validateImageUpload` (after line 30):

```js
// Returns an i18n message key, or null when the batch size is acceptable.
export function validateImageBatch(files) {
  if (files.length > MAX_IMAGE_BATCH) return 'errors.tooManyImages';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run test/files.test.js`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/files.js frontend/test/files.test.js
git commit -m "feat: add image batch-size validation (#209)"
```

---

### Task 2: Concurrency pool (`lib/concurrency.js`)

**Files:**

- Create: `frontend/src/lib/concurrency.js`
- Test: `frontend/test/concurrency.test.js`

**Interfaces:**

- Produces: `export async function runWithConcurrency(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void>` — runs `worker` over `items` with at most `limit` calls in flight; one worker rejecting must not stop or reject the others. Consumed by Task 5's `uploadImages`.

- [ ] **Step 1: Write the failing test**

Create `frontend/test/concurrency.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from '../src/lib/concurrency.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

describe('runWithConcurrency', () => {
  it('never runs more than `limit` workers at once', async () => {
    const items = [1, 2, 3, 4, 5];
    let inFlight = 0;
    let maxInFlight = 0;
    const gates = items.map(() => deferred());

    const runPromise = runWithConcurrency(items, 2, async (item, index) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gates[index].promise;
      inFlight--;
    });

    // Let the first batch start.
    await Promise.resolve();
    await Promise.resolve();
    expect(inFlight).toBe(2);

    // Release all gates in order; each release lets the next queued item start.
    for (const gate of gates) {
      gate.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
    await runPromise;

    expect(maxInFlight).toBe(2);
  });

  it('processes every item exactly once', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const seen = [];
    await runWithConcurrency(items, 3, async (item) => {
      seen.push(item);
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it("one rejecting worker doesn't stop the others", async () => {
    const items = [1, 2, 3];
    const seen = [];
    await runWithConcurrency(items, 3, async (item) => {
      seen.push(item);
      if (item === 2) throw new Error('boom');
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it('handles an empty list', async () => {
    const worker = vi.fn();
    await runWithConcurrency([], 3, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/concurrency.test.js`
Expected: FAIL — cannot find module `../src/lib/concurrency.js`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/concurrency.js`:

```js
'use strict';

// Runs `worker` over `items` with at most `limit` calls in flight at once.
// Each worker call's own success/failure is independent of the others — a
// rejecting worker is swallowed here so one bad item can't halt the batch;
// callers that need to know about failures report them through `worker`
// itself (e.g. by catching internally and recording the error on the item).
export async function runWithConcurrency(items, limit, worker) {
  let next = 0;

  async function runNext() {
    const i = next++;
    if (i >= items.length) return;
    try {
      await worker(items[i], i);
    } catch {
      // Intentionally swallowed: one item's failure must not stop the pool
      // or reject the overall runWithConcurrency() promise.
    }
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run test/concurrency.test.js`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/concurrency.js frontend/test/concurrency.test.js
git commit -m "feat: add bounded-concurrency upload pool helper (#209)"
```

---

### Task 3: HTML, CSS, and i18n scaffolding

**Files:**

- Modify: `frontend/src/index.html:196-203`
- Modify: `frontend/src/style.css` (after line 725, the end of the `.dropzone-sm` rule / before `.lightbox`)
- Modify: `frontend/src/locales/en.json`, `frontend/src/locales/de.json`, `frontend/src/locales/es.json`

**Interfaces:**

- Produces: `#image-file` accepts multiple files. CSS classes `.image-tile-pending`, `.image-progress-ring`, `.image-tile-filename`, `.image-tile-error`, `.image-tile-error-message`, `.image-tile-actions`, `.image-tile-retry`, `.image-tile-dismiss` for Task 5 to use. i18n keys `errors.tooManyImages`, `detail.retryPhotoAria`, `detail.dismissPhotoAria` for Task 5 to call `t(...)` with.
- Consumes: nothing from earlier tasks.

This task has no automated test of its own (markup/CSS/copy) — Task 6's e2e test exercises the resulting DOM, and `frontend/test/i18n.test.js` (existing, run in Task 3's verification step) guards the locale key parity.

- [ ] **Step 1: Add `multiple` to the file input and drop the shared progress bar**

In `frontend/src/index.html`, replace lines 196-203:

```html
            <input id="image-file" type="file" accept="image/jpeg,image/png" hidden />
            <p class="dropzone-text" data-i18n="detail.dropPhotos">
              Drop or click to add photos (JPEG/PNG)
            </p>
          </div>
          <div id="image-progress" class="progress hidden">
            <div id="image-progress-bar" class="progress-bar"></div>
          </div>
```

with:

```html
            <input id="image-file" type="file" accept="image/jpeg,image/png" multiple hidden />
            <p class="dropzone-text" data-i18n="detail.dropPhotos">
              Drop or click to add photos (JPEG/PNG)
            </p>
          </div>
```

(`#image-error` on the next line is unchanged — it's still used for batch-level errors.)

- [ ] **Step 2: Add per-tile CSS**

In `frontend/src/style.css`, insert after the `.dropzone-sm` rule (currently lines 723-725, right before `.lightbox`):

```css
.image-tile-pending,
.image-tile-error {
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  background: var(--color-surface-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px;
  text-align: center;
}

.image-tile-error {
  border: 1px solid var(--color-danger);
}

.image-progress-ring {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: conic-gradient(
    var(--color-primary) calc(var(--progress, 0) * 1%),
    var(--color-border) 0
  );
}

.image-tile-filename {
  font-size: 10px;
  color: var(--color-text-muted);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-tile-error-message {
  font-size: 10px;
  color: var(--color-danger);
}

.image-tile-actions {
  display: flex;
  gap: 6px;
}

.image-tile-retry,
.image-tile-dismiss {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.image-tile-dismiss:hover {
  background: var(--color-danger);
}
```

- [ ] **Step 3: Add i18n keys to all three locales**

In `frontend/src/locales/en.json`, replace line 44 (`"detail.deletePhotoAria": "Delete photo",`) with:

```json
  "detail.deletePhotoAria": "Delete photo",
  "detail.retryPhotoAria": "Retry upload",
  "detail.dismissPhotoAria": "Remove",
```

and replace line 94 (`"errors.imageSize": "Image exceeds the 10 MB limit.",`) with:

```json
  "errors.imageSize": "Image exceeds the 10 MB limit.",
  "errors.tooManyImages": "Select up to 20 photos at a time.",
```

In `frontend/src/locales/de.json`, replace line 44 (`"detail.deletePhotoAria": "Photo löschen",`) with:

```json
  "detail.deletePhotoAria": "Photo löschen",
  "detail.retryPhotoAria": "Upload wiederholen",
  "detail.dismissPhotoAria": "Entfernen",
```

and replace line 94 (`"errors.imageSize": "Bild überschreitet das 10-MB-Limit.",`) with:

```json
  "errors.imageSize": "Bild überschreitet das 10-MB-Limit.",
  "errors.tooManyImages": "Wähle maximal 20 Fotos gleichzeitig aus.",
```

In `frontend/src/locales/es.json`, replace line 44 (`"detail.deletePhotoAria": "Eliminar photo",`) with:

```json
  "detail.deletePhotoAria": "Eliminar photo",
  "detail.retryPhotoAria": "Reintentar subida",
  "detail.dismissPhotoAria": "Quitar",
```

and replace line 94 (`"errors.imageSize": "La imagen supera el límite de 10 MB.",`) with:

```json
  "errors.imageSize": "La imagen supera el límite de 10 MB.",
  "errors.tooManyImages": "Selecciona un máximo de 20 fotos a la vez.",
```

- [ ] **Step 4: Verify locale key parity and formatting**

Run: `cd frontend && npx vitest run test/i18n.test.js`
Expected: PASS — `de` and `es` still have exactly the same keys as `en`.

Run: `npx prettier --check frontend/src/index.html frontend/src/style.css frontend/src/locales/*.json`
Expected: all files report as already formatted (fix with `--write` if not).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.html frontend/src/style.css frontend/src/locales/en.json frontend/src/locales/de.json frontend/src/locales/es.json
git commit -m "feat: multi-select input, per-tile styles, new i18n strings (#209)"
```

---

### Task 4: Generalize `wireDropzone` to multiple files

**Files:**

- Modify: `frontend/src/app.js:926-952` (`wireDropzone`)
- Modify: `frontend/src/app.js:1104-1105` (call sites)
- Modify: `frontend/src/app.js:664-670` (`resetImageSection`)
- Modify: `frontend/src/app.js:93-98` (element refs)

**Interfaces:**

- Consumes: nothing new from earlier tasks in this file (Tasks 1-3 are lib/HTML/CSS/i18n only).
- Produces: `wireDropzone(zone, input, onFiles)` where `onFiles(files: File[])` replaces the old `onFile(file: File)` signature. Task 5 wires `elImageDropzone` to a new `uploadImages(files)` using this.

This task is DOM-glue-only (no Vitest coverage per the Global Constraints note); it's verified by running the app locally and by the Task 6 e2e test, which exercises both the GPX single-file path and the new multi-file image path end to end.

- [ ] **Step 1: Generalize `wireDropzone`**

In `frontend/src/app.js`, replace the `wireDropzone` function (lines 926-952):

```js
// Wire a click / keyboard / drag-drop dropzone to a hidden file input.
function wireDropzone(zone, input, onFile) {
  input.addEventListener('change', () => {
    onFile(input.files[0]);
    input.value = ''; // allow re-selecting the same file
  });
  // The input is nested inside the zone; ignore the click it bubbles back up,
  // otherwise input.click() re-enters this handler and the browser blocks the dialog.
  zone.addEventListener('click', (e) => {
    if (e.target !== input) input.click();
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    onFile(e.dataTransfer.files[0]);
  });
}
```

with:

```js
// Wire a click / keyboard / drag-drop dropzone to a hidden file input.
// onFiles receives an array of File — callers that only want one file
// destructure the first element (see the GPX wireDropzone call site).
function wireDropzone(zone, input, onFiles) {
  input.addEventListener('change', () => {
    onFiles(Array.from(input.files));
    input.value = ''; // allow re-selecting the same file(s)
  });
  // The input is nested inside the zone; ignore the click it bubbles back up,
  // otherwise input.click() re-enters this handler and the browser blocks the dialog.
  zone.addEventListener('click', (e) => {
    if (e.target !== input) input.click();
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    onFiles(Array.from(e.dataTransfer.files));
  });
}
```

- [ ] **Step 2: Update the call sites**

Replace lines 1104-1105:

```js
wireDropzone(elImageDropzone, elImageFile, uploadImage);
wireDropzone(elDropzone, elUploadFile, selectFile);
```

with:

```js
wireDropzone(elImageDropzone, elImageFile, uploadImages);
wireDropzone(elDropzone, elUploadFile, ([file]) => selectFile(file));
```

(`uploadImages` is defined in Task 5; this line will not run correctly until that task lands, but the file still needs to parse — Task 5 immediately follows in the same PR before this is tested end to end.)

- [ ] **Step 3: Drop the shared progress bar from `resetImageSection`**

Replace lines 664-670:

```js
function resetImageSection() {
  elImageGrid.innerHTML = '';
  show(elImageProgress, false);
  show(elImageError, false);
  elImageProgressBar.style.width = '0%';
  elImageDropzone.classList.remove('dragover');
}
```

with:

```js
function resetImageSection() {
  elImageGrid.innerHTML = '';
  show(elImageError, false);
  elImageDropzone.classList.remove('dragover');
}
```

- [ ] **Step 4: Remove the now-unused element refs**

Replace lines 93-98:

```js
const elImageGrid = $('tour-image-grid');
const elImageDropzone = $('image-dropzone');
const elImageFile = $('image-file');
const elImageProgress = $('image-progress');
const elImageProgressBar = $('image-progress-bar');
const elImageError = $('image-error');
```

with:

```js
const elImageGrid = $('tour-image-grid');
const elImageDropzone = $('image-dropzone');
const elImageFile = $('image-file');
const elImageError = $('image-error');
```

- [ ] **Step 5: Confirm ESLint is clean so far**

Run: `cd frontend && npx eslint src/app.js`
Expected: no errors. (There will likely be an `uploadImages is not defined` / unused-var style issue until Task 5 lands — if `no-undef` fires on `uploadImages`, that's expected and resolved by the next task; do not attempt to silence it, just proceed to Task 5 before committing this task's changes together with it if the lint step fails. If lint is clean because ESLint doesn't flag forward references at this scope, proceed to commit.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app.js
git commit -m "refactor: generalize wireDropzone to multiple files (#209)"
```

If Step 5 showed a lint error caused purely by `uploadImages` not existing yet, skip this commit and fold these changes into Task 5's commit instead — note that in your task completion notes.

---

### Task 5: Per-file upload flow (`createPendingImageTile` + `uploadImages`)

**Files:**

- Modify: `frontend/src/app.js:5` (imports)
- Modify: `frontend/src/app.js:664-758` (image upload section: `createImageTile`, `renderGallery`, `showImageError`, old `uploadImage`)

**Interfaces:**

- Consumes: `validateImageUpload`, `validateImageBatch` from `frontend/src/lib/files.js` (Task 1); `runWithConcurrency` from `frontend/src/lib/concurrency.js` (Task 2); CSS classes and i18n keys from Task 3; `wireDropzone(zone, input, onFiles)` and the `uploadImages` call site from Task 4.
- Produces: `uploadImages(files: File[]): Promise<void>` — the callback Task 4 wires to `elImageDropzone`/`elImageFile`. `createPendingImageTile(file: File)` returning `{ el: HTMLElement, setProgress(percent: number): void, setError(message: string, retryable: boolean): void, setDone(image: object): void, reset(): void, onRetry: (() => void) | null }`.

- [ ] **Step 1: Add the new imports**

Replace line 5:

```js
import { validateGpxUpload, validateImageUpload } from './lib/files.js';
```

with:

```js
import { validateGpxUpload, validateImageUpload, validateImageBatch } from './lib/files.js';
import { runWithConcurrency } from './lib/concurrency.js';
```

- [ ] **Step 2: Add `createPendingImageTile` and replace `uploadImage` with `uploadImages`**

Replace the block from `createImageTile` through the end of the old `uploadImage` (lines 672-758 — i.e. everything from the `// A thumbnail with a click-to-open lightbox and a delete overlay button.` comment through the closing `}` of `uploadImage`) with:

```js
// A thumbnail with a click-to-open lightbox and a delete overlay button.
function createImageTile(image) {
  const fig = document.createElement('figure');
  fig.className = 'image-tile';

  const img = document.createElement('img');
  img.className = 'image-thumb';
  img.src = image.url;
  img.alt = 'Tour photo';
  img.loading = 'lazy';
  img.addEventListener('click', () => openLightbox(image.url));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'image-delete';
  del.setAttribute('aria-label', t('detail.deletePhotoAria'));
  del.textContent = '✕';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteImage(image.id, fig);
  });

  fig.append(img, del);
  return fig;
}

// A grid tile representing one in-flight upload: starts pending (progress
// ring), can move to error (message + retry/dismiss) or done (swaps to the
// same markup createImageTile produces).
function createPendingImageTile(file) {
  const fig = document.createElement('figure');
  fig.className = 'image-tile image-tile-pending';

  const ring = document.createElement('div');
  ring.className = 'image-progress-ring';
  ring.style.setProperty('--progress', '0');

  const name = document.createElement('p');
  name.className = 'image-tile-filename';
  name.textContent = file.name;

  fig.append(ring, name);

  const tile = {
    el: fig,
    onRetry: null,
    setProgress(percent) {
      ring.style.setProperty('--progress', String(percent));
    },
    reset() {
      fig.className = 'image-tile image-tile-pending';
      fig.innerHTML = '';
      ring.style.setProperty('--progress', '0');
      fig.append(ring, name);
    },
    setError(message, retryable) {
      fig.className = 'image-tile image-tile-error';
      fig.innerHTML = '';

      const msg = document.createElement('p');
      msg.className = 'image-tile-error-message';
      msg.textContent = message;

      const actions = document.createElement('div');
      actions.className = 'image-tile-actions';

      if (retryable) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'image-tile-retry';
        retry.setAttribute('aria-label', t('detail.retryPhotoAria'));
        retry.textContent = '↻';
        retry.addEventListener('click', () => tile.onRetry && tile.onRetry());
        actions.append(retry);
      }

      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'image-tile-dismiss';
      dismiss.setAttribute('aria-label', t('detail.dismissPhotoAria'));
      dismiss.textContent = '✕';
      dismiss.addEventListener('click', () => fig.remove());
      actions.append(dismiss);

      fig.append(msg, actions);
    },
    setDone(image) {
      fig.replaceWith(createImageTile(image));
    },
  };
  return tile;
}

function renderGallery(tour) {
  elImageGrid.innerHTML = '';
  (tour.images || []).forEach((image) => elImageGrid.appendChild(createImageTile(image)));
}

function openLightbox(url) {
  elLightboxImg.src = url;
  show(elLightbox, true);
}

function closeLightbox() {
  show(elLightbox, false);
  elLightboxImg.src = '';
}

async function deleteImage(imageId, tileEl) {
  if (!confirm(t('confirm.deletePhoto'))) return;
  const tourId = state.selectedTourId;
  try {
    const res = await apiFetch(`/api/tours/${tourId}/images/${imageId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    tileEl.remove();
    const tour = state.tours.find((t) => t.id === tourId);
    if (tour?.images) tour.images = tour.images.filter((i) => i.id !== imageId);
  } catch {
    showImageError(t('toast.photoDeleteError'));
  }
}

function showImageError(message) {
  elImageError.textContent = message;
  show(elImageError, true);
}

// Uploads a batch of files with at most 3 in flight at once. Each file gets
// its own placeholder tile in #tour-image-grid immediately; client-invalid
// files never hit the network. Reused single-image endpoint, called once per
// file — see docs/superpowers/specs/2026-07-03-multi-image-upload-design.md.
async function uploadImages(files) {
  show(elImageError, false);
  const tourId = state.selectedTourId;
  if (!tourId || files.length === 0) return;

  const batchError = validateImageBatch(files);
  if (batchError) {
    showImageError(t(batchError));
    return;
  }

  const token = await getAccessToken();
  const jobs = [];
  for (const file of files) {
    const tile = createPendingImageTile(file);
    elImageGrid.appendChild(tile.el);

    const fileError = validateImageUpload(file);
    if (fileError) {
      tile.setError(t(fileError), false);
      continue;
    }
    jobs.push({ file, tile });
  }

  const uploadOne = async (job) => {
    job.tile.reset();
    try {
      const image = await xhrUpload(
        `${API_BASE}/api/tours/${tourId}/images`,
        job.file,
        token,
        job.tile.setProgress,
      );
      const tour = state.tours.find((t) => t.id === tourId);
      if (tour) tour.images = [...(tour.images || []), image];
      job.tile.setDone(image);
      renderPins(); // a newly uploaded geotagged photo may add a marker
    } catch (err) {
      job.tile.setError(err.message, true);
    }
  };
  jobs.forEach((job) => {
    job.tile.onRetry = () => uploadOne(job);
  });

  await runWithConcurrency(jobs, 3, uploadOne);
}
```

- [ ] **Step 3: Run ESLint and Prettier**

Run: `cd frontend && npx eslint src/app.js && npx prettier --check src/app.js`
Expected: no errors. Fix with `npx prettier --write src/app.js` if formatting differs.

- [ ] **Step 4: Manual smoke test**

Run: `./buddy.sh development start-all` (from repo root, in a separate terminal) to bring up the full local stack.

In a browser at the SWA proxy URL: open a tour, drag 3 photos (2 valid JPEG/PNG + 1 renamed `.txt`) onto the photo dropzone. Expected:

- All 3 tiles appear immediately.
- The `.txt` tile shows an error with only a dismiss button (no retry).
- The 2 valid tiles show a progress ring that fills in, then swap to real thumbnails.
- No shared progress bar appears anywhere (it no longer exists in the DOM).

Stop the stack (Ctrl+C) when done.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app.js
git commit -m "feat: per-file progress, retry, and dismiss for multi-image upload (#209)"
```

(If Task 4's commit was folded in here per its Step 6 note, this single commit covers both.)

---

### Task 6: End-to-end coverage

**Files:**

- Modify: `e2e/pages/main-page.ts`
- Modify: `e2e/tests-fullstack/tours.spec.ts`

**Interfaces:**

- Consumes: the real running app from Tasks 1-5 (`#image-file[multiple]`, `.image-tile-pending`, `.image-tile-error`, `.image-tile-retry`, `.image-tile-dismiss` classes/selectors).
- Produces: nothing consumed by other tasks — this is the last task.

- [ ] **Step 1: Extend the page object for multi-file input and tile states**

In `e2e/pages/main-page.ts`, change the `addImage` signature in the `MainPage` interface (line 21):

```ts
    addImage(file: FileInput): Promise<void>;
```

to:

```ts
    addImage(files: FileInput | FileInput[]): Promise<void>;
```

Change the `image` locators block (lines 55-58) to add pending/error selectors:

```ts
image: {
  input: Locator;
  thumbs: Locator;
}
```

to:

```ts
image: {
  input: Locator;
  thumbs: Locator;
  pendingTiles: Locator;
  errorTiles: Locator;
  retryButtons: Locator;
  dismissButtons: Locator;
}
```

Change the `locators.image` object (lines 102-105):

```ts
    image: {
      input: page.locator('#image-file'),
      thumbs: page.locator('#tour-image-grid .image-thumb'),
    },
```

to:

```ts
    image: {
      input: page.locator('#image-file'),
      thumbs: page.locator('#tour-image-grid .image-thumb'),
      pendingTiles: page.locator('#tour-image-grid .image-tile-pending'),
      errorTiles: page.locator('#tour-image-grid .image-tile-error'),
      retryButtons: page.locator('#tour-image-grid .image-tile-retry'),
      dismissButtons: page.locator('#tour-image-grid .image-tile-dismiss'),
    },
```

Change the `addImage` implementation (lines 153-155):

```ts
    addImage: async (file: FileInput) => {
      await locators.image.input.setInputFiles(file);
    },
```

to:

```ts
    addImage: async (files: FileInput | FileInput[]) => {
      await locators.image.input.setInputFiles(files);
    },
```

(Playwright's `setInputFiles` already accepts a single value or an array — this is a type-signature-only change; `#image-file` now has the `multiple` attribute from Task 3, so an array works.)

- [ ] **Step 2: Write the failing test**

In `e2e/tests-fullstack/tours.spec.ts`, add this test after the existing `tour lifecycle` test (after line 39):

```ts
buddyTest('multi-image upload: per-file success and error handling', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();

  const tourName = `CI E2E Multi ${Date.now()}`;
  await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
  await expect(on(page).main.locators.detail.name).toHaveText(tourName);

  const invalidFile = {
    name: 'not-a-photo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  };

  // Two valid images + one invalid file dropped in the same selection.
  await on(page).main.do.addImage([SAMPLE_JPG, SAMPLE_JPG, invalidFile]);

  // The invalid file never hits the network: it's an error tile immediately,
  // with only a dismiss button (not retryable).
  await expect(on(page).main.locators.image.errorTiles).toHaveCount(1);
  await expect(on(page).main.locators.image.retryButtons).toHaveCount(0);

  // Both valid uploads complete (capped-concurrency pool still finishes all).
  await expect(on(page).main.locators.image.thumbs).toHaveCount(2);
  await expect(on(page).main.locators.image.pendingTiles).toHaveCount(0);

  // Dismissing the error tile removes it.
  await on(page).main.do.dismissImageError();
  await expect(on(page).main.locators.image.errorTiles).toHaveCount(0);
});
```

Add a `dismissImageError` action to the `do` interface and implementation in `main-page.ts` — in the `MainPage` interface, add after `addImage` (after line 21):

```ts
    dismissImageError(): Promise<void>;
```

and in the `interactions` object, add after the `addImage` implementation:

```ts
    dismissImageError: async () => {
      await locators.image.dismissButtons.first().click();
    },
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd e2e && npm run test:fullstack -- tours.spec.ts` (requires the local stack up: `./buddy.sh development start-cosmos` + `start-azurite` + a running Functions host, or use the project's usual fullstack test bootstrap per `docs/how-to/developer-guide.md`).
Expected: FAIL before Tasks 1-5 land (`.image-tile-error`/`.image-tile-pending` don't exist yet). If run after Tasks 1-5 are already implemented, this step instead confirms the new test passes — either order is fine since this plan is executed task-by-task in sequence; if Tasks 1-5 are already done by the time you reach this task, treat this as the "PASS" check directly and note that in your task completion notes.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd e2e && npm run test:fullstack -- tours.spec.ts`
Expected: PASS, both the original `tour lifecycle` test and the new `multi-image upload` test green.

- [ ] **Step 5: Commit**

```bash
git add e2e/pages/main-page.ts e2e/tests-fullstack/tours.spec.ts
git commit -m "test(e2e): cover multi-image upload success and per-file errors (#209)"
```

---

## Final verification

- [ ] Run the full frontend unit suite: `cd frontend && npm test` — expect all green, including the new `concurrency.test.js` and the extended `files.test.js`/`i18n.test.js`.
- [ ] Run `prek run --all-files` from the repo root — expect all hooks (ESLint, Prettier, markdownlint, OpenGrep, etc.) to pass.
- [ ] Run the e2e fullstack suite: `cd e2e && npm run test:fullstack` — expect all green.
- [ ] Open a PR referencing `Fixes #209` so it auto-closes on merge (per this project's workflow).
