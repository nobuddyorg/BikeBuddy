# Per-tour image limit — design

**Issue:** [#232](https://github.com/nobuddyorg/BikeBuddy/issues/232)
**Status:** Approved, ready for implementation plan

## Problem

Tours can accumulate unlimited photos today — no cap exists anywhere in `functions/src/` or `frontend/src/` (confirmed while building #209's multi-image upload). Issue #232 asks for a cap of 20 photos per tour.

## Goals

- A tour cannot exceed 20 images.
- The cap is enforced server-side (authoritative) and pre-checked client-side (fast feedback, no wasted requests).
- Multi-image upload (#209) degrades gracefully: files that fit under the cap still upload; only the overflow gets an error, matching the existing per-tile error pattern (batch-size cap, invalid type) rather than failing the whole batch.

## Non-goals

- No UI for viewing/managing the cap (e.g. "38/20 photos" counter) — just enforcement and an error when exceeded.
- No change to `MAX_IMAGE_BATCH` (still 20 files per selection) — the two caps are independent and both apply.

## Design

**Backend** (`functions/src/UploadImage/index.js`): a new `const MAX_TOUR_IMAGES = 20;` near the top. Right after the existing ownership check (`readItem` → 404 if not found, line 43), add: if `(tour.images || []).length >= MAX_TOUR_IMAGES`, return `error(400, 'This tour already has the maximum of 20 photos.')` — before parsing the multipart body, so a rejected upload doesn't waste time parsing/resizing.

**Frontend** (`frontend/src/lib/files.js`): a new `MAX_TOUR_IMAGES = 20` and pure helper:

```js
// Returns an i18n message key, or null when there's room for another image.
export function validateImageQuota(existingCount) {
  if (existingCount >= MAX_TOUR_IMAGES) return 'errors.tourImageLimit';
  return null;
}
```

**Frontend wiring** (`frontend/src/app.js`, inside `uploadImages`): after the existing batch-size check, compute `remainingSlots = MAX_TOUR_IMAGES - (tour.images?.length || 0)` once per batch. While building `jobs` from `files`, once `remainingSlots` files have been accepted, every subsequent file in the same drop gets `tile.setError(t('errors.tourImageLimit'), false)` immediately (no network call, not retryable — retrying doesn't change the fact the tour is full) instead of being queued. This mirrors the existing client-invalid-file handling already in that loop.

**i18n:** new key `errors.tourImageLimit` = "This tour already has the maximum of 20 photos." (and de/es translations) — used for the client-side pre-check. The backend's 400 response is surfaced verbatim by the existing error-tile path (same as any other server rejection), no i18n key needed there.

## Testing plan

- Backend unit test (`functions/src/UploadImage/index.test.js`): tour with 20 existing images → `uploadImage` returns 400 without calling `parseFile`/`getImagesContainer`.
- Frontend unit test (`frontend/test/files.test.js`): `validateImageQuota` at/under/over the cap.
- Manual smoke test (mock backend, as used for #209) covering the graceful-degradation case: a tour near the cap, a batch that partially fits.
