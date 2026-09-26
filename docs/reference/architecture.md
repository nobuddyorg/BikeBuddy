# Reference: Architecture

```text
Browser (GitHub Pages, https://nobuddy.org/BikeBuddy/)
  │  plain HTML/CSS/JS · Leaflet + MSAL (vendored)
  │  Authorization: Bearer <Entra access token>
  ▼
Azure Functions (Node 24, Flex Consumption)   ── auth: Entra External ID (OIDC)
  ├─ Cosmos DB Serverless   users (/id), tours (/userId), deletions (/id)
  └─ Blob Storage (LRS)     gpx-files, tour-images, deployments
```

## Components

| Component | Tech                                       | Notes                                                                            |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Frontend  | Static HTML/CSS/JS on GitHub Pages         | No bundler; Leaflet and MSAL vendored in `frontend/src/vendor/`.                 |
| API       | Azure Functions, Node 24, Flex Consumption | One folder per function in `functions/src/<Name>/`.                              |
| Database  | Cosmos DB Serverless                       | `users` and `deletions` partitioned by `/id`, `tours` and `tracks` by `/userId`. |
| Files     | Azure Blob Storage (LRS)                   | Images resized (≤2000px) with `sharp`; served via short-lived SAS URLs.          |
| Auth      | Microsoft Entra External ID                | OIDC; token validated in `authMiddleware.js`.                                    |
| Infra     | OpenTofu (`infrastructure/`)               | Remote azurerm state.                                                            |

## Functions (API)

Every route lives under `/api/v1/` (#579). The paths from before, without
`v1/` (`POST /api/tours/upload` for the upload), stay registered for pages
loaded before the move, with the very same handler (`apiRoute` in
`lib/functionsApp.js`; `test/unit/endpoints.test.js` holds each alias to it).
They are deprecated: the frontend calls only `/api/v1/`.

| Route                                     | Function                                                              |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `GET /health`                             | Health — public liveness probe, no auth                               |
| `GET /me`                                 | GetMe — returns/creates the caller's user doc                         |
| `PATCH /me`                               | UpdateProfile — the caller's display name                             |
| `GET /me/export`                          | ExportData — the caller's user doc and tours as JSON, with file links |
| `DELETE /account`                         | DeleteAccount — the caller's data, then queues the user               |
| `GET /tours`                              | GetTours — list (no `heatmapData`); pages with `?limit`               |
| `GET /tours/{tourId}`                     | GetTour — detail incl. `heatmapData` + image SAS URLs                 |
| `GET /map`                                | GetMapData — all tours' points + geotagged photo pins; `?limit`       |
| `POST /tours`                             | UploadTour — parse GPX, downsample, store                             |
| `PATCH /tours/{tourId}`                   | EditTour — name, description, date                                    |
| `DELETE /tours/{tourId}`                  | DeleteTour — the document, then its GPX and photo blobs               |
| `POST /tours/{tourId}/images`             | UploadImage — resize, extract GPS, store                              |
| `DELETE /tours/{tourId}/images/{imageId}` | DeleteImage                                                           |

Every route except `/health` authenticates through `authMiddleware`; the
tour-scoped ones load the tour through `loadOwnedTour` in the caller's
partition.

- **Upload** (`POST /tours`): `multipart/form-data` with the GPX as `file` and
  optional `name` and `description` fields, validated like an edit. The
  unversioned alias still reads them from the query string, as older pages send
  them; a form field wins over the same query parameter. The answer is 201 with
  `Location: /api/v1/tours/{id}` and the new tour's `id` (and `tourId`, which
  older pages read).
- **Paging** (`GET /tours`, `GET /map`): without `limit` the whole list, as
  the frontend asks for it. With `?limit=1..100` the body is
  `{ items, continuationToken? }`: pass the token back with the same `limit`
  for the next page; no token means the last page. The token is the API's own
  (a position, not a Cosmos token), so nothing a client sends reaches Cosmos
  but a number; a malformed one is `400 errors.pageInvalid`. Pages are
  ordered newest first; a tour added or deleted between two requests shifts
  the rest by one. A map page is budgeted on its own and never cached.

## Key data rules

- Uploads are limited per rider: 1,000 tours, 5 GB stored, 100 uploads an hour
  (#549; design-decisions.md, "Upload limits"). The stored size is recorded on
  the documents: `gpxBytes` on a tour, `bytes` (full size plus thumbnail) on
  each photo entry.
- `heatmapData` (the downsampled track points the map draws as routes) is
  stored apart from the tour, in the `tracks` container under the tour's id
  (#615). It is excluded from the tour list and from Cosmos indexing;
  `GetTour` reads it with one point read and `GetMapData` returns it by design,
  within a point budget.
- Responses are projected, never the raw stored document: Cosmos system
  properties (`_rid`, `_self`, `_etag`, `_ts`) and `userId` stay server-side.
  `ExportData` returns every field of the caller's documents except those
  system properties: a portability export is the user's whole data. In place
  of the stored blob references, which open nothing, each tour carries signed
  links to its GPX file and photos, valid until `linksExpireAt` (one to two
  hours).
- GPX > 5,000 trackpoints is downsampled before storing (keeps docs < 2 MB).
- Image GPS (EXIF) is read from the original before resize strips it; stored as
  `lat`/`lon` on the image record and used for map pins.
- Every error answers `{ "error": "<i18n key>" }` (`ERROR_KEYS` in
  `functions/src/lib/http.js`). An unexpected failure answers 500, or 503 with
  `Retry-After: 5` for Cosmos throttling after the SDK's retries, with the
  `invocationId` to find it in the logs and never the failure's own text
  (`lib/failureResponse.js`, around every registered handler).

See [Design decisions](../explanation/design-decisions.md) for the _why_.
