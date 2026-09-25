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

| Component | Tech                                       | Notes                                                                   |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Frontend  | Static HTML/CSS/JS on GitHub Pages         | No bundler; Leaflet and MSAL vendored in `frontend/src/vendor/`.        |
| API       | Azure Functions, Node 24, Flex Consumption | One folder per function in `functions/src/<Name>/`.                     |
| Database  | Cosmos DB Serverless                       | `users` and `deletions` partitioned by `/id`, `tours` by `/userId`.     |
| Files     | Azure Blob Storage (LRS)                   | Images resized (≤2000px) with `sharp`; served via short-lived SAS URLs. |
| Auth      | Microsoft Entra External ID                | OIDC; token validated in `authMiddleware.js`.                           |
| Infra     | OpenTofu (`infrastructure/`)               | Remote azurerm state.                                                   |

## Functions (API)

| Route                                         | Function                                                |
| --------------------------------------------- | ------------------------------------------------------- |
| `GET /api/health`                             | Health — public liveness probe, no auth                 |
| `GET /api/me`                                 | GetMe — returns/creates the caller's user doc           |
| `PATCH /api/me`                               | UpdateProfile — the caller's display name               |
| `GET /api/me/export`                          | ExportData — the caller's user doc and tours as JSON    |
| `DELETE /api/account`                         | DeleteAccount — the caller's data, then queues the user |
| `GET /api/tours`                              | GetTours — list (no `heatmapData`)                      |
| `GET /api/tours/{tourId}`                     | GetTour — detail incl. `heatmapData` + image SAS URLs   |
| `GET /api/map`                                | GetMapData — all tours' points + geotagged photo pins   |
| `POST /api/tours/upload`                      | UploadTour — parse GPX, downsample, store               |
| `PATCH /api/tours/{tourId}`                   | EditTour — name, description, date                      |
| `DELETE /api/tours/{tourId}`                  | DeleteTour — the document, then its GPX and photo blobs |
| `POST /api/tours/{tourId}/images`             | UploadImage — resize, extract GPS, store                |
| `DELETE /api/tours/{tourId}/images/{imageId}` | DeleteImage                                             |

Every route except `/api/health` authenticates through `authMiddleware`; the
tour-scoped ones load the tour through `loadOwnedTour` in the caller's
partition.

## Key data rules

- `heatmapData` (the downsampled track points the map draws as routes) is
  excluded from the tour list and from Cosmos indexing; `GetMapData` returns it
  by design, within a point budget.
- Responses are projected, never the raw stored document: Cosmos system
  properties (`_rid`, `_self`, `_etag`, `_ts`) and `userId` stay server-side.
  `ExportData` returns every field of the caller's documents except those
  system properties: a portability export is the user's whole data.
- GPX > 5,000 trackpoints is downsampled before storing (keeps docs < 2 MB).
- Image GPS (EXIF) is read from the original before resize strips it; stored as
  `lat`/`lon` on the image record and used for map pins.

See [Design decisions](../explanation/design-decisions.md) for the _why_.
