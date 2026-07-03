# Per-Tour Image Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap tours at 20 images, enforced server-side and pre-checked client-side, with multi-image upload (#209) degrading gracefully — files under the cap still upload, only overflow errors out.

**Architecture:** A `MAX_TOUR_IMAGES = 20` constant duplicated in backend (`functions/src/UploadImage/index.js`) and frontend (`frontend/src/lib/files.js`), matching this codebase's existing pattern for `MAX_IMAGE_BYTES` (no shared package between the two runtimes).

**Tech Stack:** Same as the rest of the repo — Node.js Azure Functions backend, plain ES modules frontend, Vitest for both.

## Global Constraints

- Cap is exactly 20 images per tour (`MAX_TOUR_IMAGES`).
- Backend check happens before multipart parsing (fail fast, no wasted work).
- Overflow files in a batch get individual error tiles (not retryable), not a whole-batch rejection.
- New i18n key needs entries in all three locales (`en`, `de`, `es`) — `frontend/test/i18n.test.js` enforces parity.

---

## File Structure

- Modify `functions/src/UploadImage/index.js` — add the count check.
- Modify `functions/src/UploadImage/index.test.js` — test for the 400 case.
- Modify `frontend/src/lib/files.js` — add `MAX_TOUR_IMAGES` + `validateImageQuota`.
- Modify `frontend/test/files.test.js` — tests for `validateImageQuota`.
- Modify `frontend/src/locales/{en,de,es}.json` — new `errors.tourImageLimit` key.
- Modify `frontend/src/app.js` — wire the quota check into `uploadImages`.

---

### Task 1: Backend enforcement

**Files:**

- Modify: `functions/src/UploadImage/index.js`
- Test: `functions/src/UploadImage/index.test.js`

**Interfaces:**

- Produces: a 400 response `{ error: 'This tour already has the maximum of 20 photos.' }` when `tour.images.length >= 20`, returned before `parseFile`/`getImagesContainer` are called.

- [ ] **Step 1: Write the failing test**

Add to `functions/src/UploadImage/index.test.js`, inside the `describe('POST /api/tours/{tourId}/images'` block, after the `'returns 404 when the tour is not in the caller partition'` test (after line 215):

```js
it('returns 400 when the tour already has 20 images', async () => {
  const full = Array.from({ length: 20 }, (_, i) => ({ id: `img${i}`, blobName: `u1/${i}.jpg` }));
  const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: full } }));
  const images = makeImagesContainer();
  const parseFile = makeParseFile(JPEG);
  const res = await uploadImage(
    reqWith(TID),
    mockAuth,
    () => tours.container,
    () => images.container,
    parseFile,
    noResize,
  );
  expect(res.status).toBe(400);
  expect(res.jsonBody.error).toBe('This tour already has the maximum of 20 photos.');
  expect(parseFile).not.toHaveBeenCalled();
  expect(images.getBlockBlobClient).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run src/UploadImage/index.test.js`
Expected: FAIL — a tour with 20 images currently uploads a 21st successfully (status 201, not 400).

- [ ] **Step 3: Write minimal implementation**

In `functions/src/UploadImage/index.js`, add after the `unauthorized, error` import (line 12):

```js
const MAX_TOUR_IMAGES = 20;
```

Then replace the ownership-check block (lines 41-43):

```js
// Ownership: the tour must be in the caller's partition.
const tour = await readItem(getToursContainer(), tourId, userId);
if (!tour) return error(404, 'Tour not found');
```

with:

```js
// Ownership: the tour must be in the caller's partition.
const tour = await readItem(getToursContainer(), tourId, userId);
if (!tour) return error(404, 'Tour not found');

if ((tour.images || []).length >= MAX_TOUR_IMAGES) {
  return error(400, 'This tour already has the maximum of 20 photos.');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run src/UploadImage/index.test.js`
Expected: PASS, all tests in the file green (including the new one).

- [ ] **Step 5: Commit**

```bash
git add functions/src/UploadImage/index.js functions/src/UploadImage/index.test.js
git commit -m "feat: enforce 20-image-per-tour limit server-side (#232)"
```

---

### Task 2: Frontend quota helper

**Files:**

- Modify: `frontend/src/lib/files.js`
- Test: `frontend/test/files.test.js`

**Interfaces:**

- Produces: `export const MAX_TOUR_IMAGES = 20;` and `export function validateImageQuota(existingCount: number): string | null` — returns `'errors.tourImageLimit'` when `existingCount >= MAX_TOUR_IMAGES`, else `null`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

In `frontend/test/files.test.js`, add `validateImageQuota, MAX_TOUR_IMAGES` to the existing import:

```js
import {
  isGpxFile,
  isImageFile,
  validateGpxUpload,
  validateImageUpload,
  validateImageBatch,
  validateImageQuota,
  MAX_UPLOAD_BYTES,
  MAX_IMAGE_BATCH,
  MAX_TOUR_IMAGES,
} from '../src/lib/files.js';
```

Add this `describe` block at the end of the file:

```js
describe('validateImageQuota', () => {
  it('returns null under the cap', () => {
    expect(validateImageQuota(MAX_TOUR_IMAGES - 1)).toBeNull();
  });

  it('returns the i18n key at or over the cap', () => {
    expect(validateImageQuota(MAX_TOUR_IMAGES)).toBe('errors.tourImageLimit');
    expect(validateImageQuota(MAX_TOUR_IMAGES + 1)).toBe('errors.tourImageLimit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/files.test.js`
Expected: FAIL — `validateImageQuota`/`MAX_TOUR_IMAGES` not exported.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/lib/files.js`, add after `MAX_IMAGE_BATCH` (after the line added in #209's Task 1):

```js
export const MAX_TOUR_IMAGES = 20;
```

Add after `validateImageBatch`:

```js
// Returns an i18n message key, or null when there's room for another image.
export function validateImageQuota(existingCount) {
  if (existingCount >= MAX_TOUR_IMAGES) return 'errors.tourImageLimit';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run test/files.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/files.js frontend/test/files.test.js
git commit -m "feat: add per-tour image quota validation helper (#232)"
```

---

### Task 3: i18n key

**Files:**

- Modify: `frontend/src/locales/en.json`, `frontend/src/locales/de.json`, `frontend/src/locales/es.json`

**Interfaces:**

- Produces: `errors.tourImageLimit` key, consumed by Task 4 via `t('errors.tourImageLimit')`.

- [ ] **Step 1: Add the key to all three locales**

In `frontend/src/locales/en.json`, replace line 96 (`"errors.imageSize": "Image exceeds the 10 MB limit.",`) with:

```json
  "errors.imageSize": "Image exceeds the 10 MB limit.",
  "errors.tourImageLimit": "This tour already has the maximum of 20 photos.",
```

In `frontend/src/locales/de.json`, replace the equivalent `errors.imageSize` line with:

```json
  "errors.imageSize": "Bild überschreitet das 10-MB-Limit.",
  "errors.tourImageLimit": "Diese Tour hat bereits die maximale Anzahl von 20 Fotos.",
```

In `frontend/src/locales/es.json`, replace the equivalent `errors.imageSize` line with:

```json
  "errors.imageSize": "La imagen supera el límite de 10 MB.",
  "errors.tourImageLimit": "Esta ruta ya tiene el máximo de 20 fotos.",
```

- [ ] **Step 2: Verify locale key parity**

Run: `cd frontend && npx vitest run test/i18n.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/locales/en.json frontend/src/locales/de.json frontend/src/locales/es.json
git commit -m "feat: add tour-image-limit i18n strings (#232)"
```

---

### Task 4: Wire the quota check into `uploadImages`

**Files:**

- Modify: `frontend/src/app.js:5` (import)
- Modify: `frontend/src/app.js` (`uploadImages`, the file-loop that builds `jobs`)

**Interfaces:**

- Consumes: `validateImageQuota` from Task 2, `errors.tourImageLimit` from Task 3.
- Produces: no new exports — this closes out the feature.

DOM-glue-only, no Vitest coverage (same reasoning as #209's app.js changes) — verified by a manual smoke test.

- [ ] **Step 1: Import the new helper**

Replace the files.js import line:

```js
import { validateGpxUpload, validateImageUpload, validateImageBatch } from './lib/files.js';
```

with:

```js
import {
  validateGpxUpload,
  validateImageUpload,
  validateImageBatch,
  validateImageQuota,
} from './lib/files.js';
```

- [ ] **Step 2: Reject overflow files in the batch loop**

In `uploadImages`, the current file-loop (inside the `for (const file of files)` loop) is:

```js
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
```

Replace it with:

```js
const token = await getAccessToken();
const tour = state.tours.find((t) => t.id === tourId);
let imageCount = tour?.images?.length || 0;
const jobs = [];
for (const file of files) {
  const tile = createPendingImageTile(file);
  elImageGrid.appendChild(tile.el);

  const quotaError = validateImageQuota(imageCount);
  if (quotaError) {
    tile.setError(t(quotaError), false);
    continue;
  }

  const fileError = validateImageUpload(file);
  if (fileError) {
    tile.setError(t(fileError), false);
    continue;
  }
  imageCount++;
  jobs.push({ file, tile });
}
```

(`imageCount` is incremented optimistically per accepted file so a batch of 5 against a tour with 38/20 images accepts exactly 2 and error-tiles the other 3, without waiting for uploads to actually finish.)

- [ ] **Step 3: Lint, format, and manually verify**

Run:

```bash
cd /Users/nicolemundhenke/Repos/BikeBuddy
functions/node_modules/.bin/eslint --config functions/eslint.frontend.config.js frontend/src frontend/test
cd functions && npx prettier --check --config .prettierrc.json '../frontend/*.js' '../frontend/src/*.{js,css,html}' '../frontend/src/lib/**/*.js' '../frontend/test/**/*.js'
```

Expected: no errors from either command.

Manual smoke test (reuse the mock-backend approach from #209): seed a tour with 18 fake images already in its `images` array, open its detail panel, drop 5 files. Expected: first 2 upload and become real thumbnails; the other 3 immediately show an error tile reading "This tour already has the maximum of 20 photos." with a dismiss button only (no retry).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app.js
git commit -m "feat: enforce per-tour image quota in multi-image upload flow (#232)"
```

---

## Final verification

- [ ] `cd frontend && npm test` — all unit tests pass.
- [ ] `cd functions && npm test` — all unit tests pass.
- [ ] `prek run --all-files` (or run on just the changed files) — all hooks pass.
- [ ] Open a PR with `Fixes #232` in the body so it auto-closes on merge.
