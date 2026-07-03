# Multi-image upload — design

**Issue:** [#209](https://github.com/nobuddyorg/BikeBuddy/issues/209)
**Status:** Approved, ready for implementation plan

## Problem

The tour detail panel's photo dropzone (`frontend/src/index.html:186-205`) only accepts one file per interaction: the hidden `<input id="image-file">` has no `multiple` attribute, and `wireDropzone` (`frontend/src/app.js:926`) always forwards just `input.files[0]` / `e.dataTransfer.files[0]` to its callback. Uploading several photos for a tour means repeating the whole click-pick-wait cycle per photo.

## Goals

- Select or drag-drop multiple image files at once.
- Upload them without serializing all requests behind one shared progress bar.
- Show progress and errors per file, not as one shared state for the whole batch.
- A failure on one file must not block or hide the others.

## Non-goals

- No backend/API changes. `POST /api/tours/{tourId}/images` (`functions/src/UploadImage/index.js`) already accepts exactly one file per request and stays that way — the issue is explicit that this is a frontend-only change.
- No per-tour image-count limit. None exists today (confirmed: no `MAX_IMAGES`/count check anywhere in `functions/src/` or `frontend/src/`), and this project doesn't add one — only a per-_selection_ cap (see below).

## Current state (for reference)

- `wireDropzone(zone, input, onFile)` (`app.js:926`) wires click/keyboard/drag/drop and calls `onFile(file)` with a single `File`.
- `uploadImage(file)` (`app.js:732`): client-validates via `validateImageUpload` (`lib/files.js:26`), shows the single shared `#image-progress` bar, calls `xhrUpload`, appends the result to `tour.images` and to `#tour-image-grid` via `createImageTile(image)` (`app.js:673`).
- `xhrUpload(url, file, token, onProgress)` (`app.js:341`): one `FormData` field `file`, `XMLHttpRequest` for real progress events, resolves parsed JSON on `201`.
- `createImageTile(image)` (`app.js:673`): builds a `<figure class="image-tile">` with a lazy `<img>` (click → lightbox) and a `✕` delete button.
- The GPX dropzone (`#dropzone` / `#upload-file`, no `multiple`) reuses the same `wireDropzone` via `selectFile(file)` (`app.js:875`), also single-file.
- `MAX_IMAGE_BYTES = 10 * 1024 * 1024` and `validateImageUpload` live in `frontend/src/lib/files.js` — pure, unit-tested (`frontend/test/files.test.js`).

## Design

### 1. `wireDropzone` becomes multi-file

`wireDropzone(zone, input, onFiles)` calls `onFiles(Array.from(input.files))` / `onFiles(Array.from(e.dataTransfer.files))` instead of a single file. The two call sites (`app.js:1104-1105`) adjust:

- `wireDropzone(elImageDropzone, elImageFile, uploadImages)` — new plural handler (see below).
- `wireDropzone(elDropzone, elUploadFile, ([file]) => selectFile(file))` — GPX flow keeps taking just the first file; its input stays without `multiple`, so a user can still only pick one `.gpx` at a time, but the callback shape is now consistent.

`#image-file` gains the `multiple` attribute in `index.html`.

### 2. Batch cap

New constant in `frontend/src/lib/files.js`: `MAX_IMAGE_BATCH = 20`, and a pure helper:

```js
// Returns an i18n message key, or null when the batch size is acceptable.
export function validateImageBatch(files) {
  if (files.length > MAX_IMAGE_BATCH) return 'errors.tooManyImages';
  return null;
}
```

`uploadImages(files)` checks this first. If it fails, `showImageError(t('errors.tooManyImages'))` and **no** tiles/uploads are created for that drop — the user re-selects a smaller batch.

### 3. Concurrency pool

New pure helper, `frontend/src/lib/concurrency.js`:

```js
// Runs `worker` over `items` with at most `limit` in flight at once.
// Each worker call's own success/failure is independent of the others.
export async function runWithConcurrency(items, limit, worker) {
  let next = 0;
  async function runNext() {
    const i = next++;
    if (i >= items.length) return;
    await worker(items[i], i);
    return runNext();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}
```

`uploadImages` calls `runWithConcurrency(validFiles, 3, uploadOne)`. Unit-tested with fake workers (assert max concurrency never exceeds the limit, and that one rejecting worker doesn't stop the others).

### 4. Per-tile state machine

Replaces the single shared `#image-progress`/`#image-progress-bar` for the upload flow: that markup (`index.html:201-203`) and the `elImageProgress`/`elImageProgressBar` references are removed, including the two lines in `resetImageSection()` (`app.js:664`) that show/reset them. `#image-error` stays, but only for batch-level errors like the count cap; per-file errors move into the tile itself.

New tile builder, `createPendingImageTile(file)`, alongside the existing `createImageTile(image)`:

- Structure: `<figure class="image-tile image-tile-pending">` containing a filename-labeled placeholder and a progress ring (CSS-driven, updated via a `--progress` custom property or a text percentage — implementation detail for the plan).
- Returned handle exposes `setProgress(percent)`, `setError(message)`, `setDone(image)` so the caller can drive one tile through its lifecycle without re-querying the DOM.
- `setError(message)`: swaps the tile to `.image-tile-error`, shows the message, a retry button (calls `uploadOne` again for that same `file`, resetting the tile to pending) and a dismiss button (`fig.remove()`).
- `setDone(image)`: replaces the tile's contents with the same markup `createImageTile(image)` produces (thumbnail + delete button), so a finished upload is indistinguishable from one that was already there on page load.

`uploadImages(files)`:

```js
async function uploadImages(files) {
  show(elImageError, false);
  const tourId = state.selectedTourId;
  if (!tourId || files.length === 0) return;
  const batchError = validateImageBatch(files);
  if (batchError) return showImageError(t(batchError));

  const token = await getAccessToken();
  const jobs = files
    .map((file) => {
      const fileError = validateImageUpload(file);
      const tile = createPendingImageTile(file);
      elImageGrid.appendChild(tile.el);
      if (fileError) {
        tile.setError(t(fileError));
        return null; // no network call for client-invalid files
      }
      return { file, tile };
    })
    .filter(Boolean);

  const uploadOne = async ({ file, tile }) => {
    try {
      const image = await xhrUpload(
        `${API_BASE}/api/tours/${tourId}/images`,
        file,
        token,
        tile.setProgress,
      );
      const tour = state.tours.find((t) => t.id === tourId);
      if (tour) tour.images = [...(tour.images || []), image];
      tile.setDone(image);
      renderPins();
    } catch (err) {
      tile.setError(err.message);
    }
  };

  await runWithConcurrency(jobs, 3, uploadOne);
}
```

Retry re-runs `uploadOne` for that single `{ file, tile }` pair outside the original pool (manual retries are low-volume; no need to route them back through the shared limiter).

### 5. i18n

New key `errors.tooManyImages` (e.g. "Select up to 20 photos at a time.") added to all three locales (`en.json`, `de.json`, `es.json`) to satisfy the existing key-parity unit test. Retry/dismiss buttons reuse `detail.deletePhotoAria`-style aria-label keys; exact new key names (`detail.retryPhotoAria` etc.) are an implementation detail for the plan.

### 6. CSS

New tile-state classes (`.image-tile-pending`, `.image-tile-error`) added near the existing `.image-tile`/`.image-delete` rules in `style.css`, reusing the same sizing/grid so pending and error tiles don't shift the layout once they resolve to `.image-tile`.

## Testing plan

- **Unit (Vitest, `frontend/test/`):**
  - `lib/files.test.js`: `validateImageBatch` — under/at/over the cap.
  - `lib/concurrency.test.js` (new): `runWithConcurrency` — respects the limit with fake delayed workers, all items eventually processed, one rejecting worker doesn't halt the rest.
- **E2E (Playwright, `e2e/tests-fullstack/`):** select/drop multiple files including one deliberately invalid (wrong extension) mixed in; assert the grid ends with N-1 real thumbnails plus one error tile with working retry (swap in a valid file) and dismiss.

## Out of scope

- Backend batch endpoint (explicitly ruled out by the issue).
- Per-tour image count limit.
- Reordering/drag-to-reorder of uploaded images.
