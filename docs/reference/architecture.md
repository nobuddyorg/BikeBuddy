# Reference: Architecture

```text
Browser (GitHub Pages, https://nobuddy.org/BikeBuddy/)
  │  plain HTML/CSS/JS · Leaflet + Leaflet.heat · MSAL (vendored)
  │  Authorization: Bearer <Entra access token>
  ▼
Azure Functions (Node 22, Flex Consumption)   ── auth: Entra External ID (OIDC)
  ├─ Cosmos DB Serverless   users (/id), tours (/userId)
  └─ Blob Storage (LRS)     gpx-files, images, deployments
```

## Components

| Component | Tech                                       | Notes                                                                   |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Frontend  | Static HTML/CSS/JS on GitHub Pages         | No bundler; Leaflet via CDN, MSAL vendored in `frontend/vendor/`.       |
| API       | Azure Functions, Node 22, Flex Consumption | One folder per function in `functions/src/<Name>/`.                     |
| Database  | Cosmos DB Serverless                       | `users` partitioned by `/id`, `tours` by `/userId`.                     |
| Files     | Azure Blob Storage (LRS)                   | Images resized (≤2000px) with `sharp`; served via short-lived SAS URLs. |
| Auth      | Microsoft Entra External ID                | OIDC; token validated in `authMiddleware.js`.                           |
| Infra     | OpenTofu (`infrastructure/`)               | Remote azurerm state.                                                   |

## Functions (API)

| Route                                     | Function                                              |
| ----------------------------------------- | ----------------------------------------------------- |
| `GET /api/me`                             | GetMe — returns/creates the caller's user doc         |
| `GET /api/tours`                          | GetTours — list (no `heatmapData`)                    |
| `GET /api/tours/{id}`                     | GetTour — detail incl. `heatmapData` + image SAS URLs |
| `POST /api/tours/upload`                  | UploadTour — parse GPX, downsample, store             |
| `PATCH /api/tours/{id}`                   | EditTour                                              |
| `DELETE /api/tours/{id}`                  | DeleteTour                                            |
| `POST /api/tours/{id}/images`             | UploadImage — resize, extract GPS, store              |
| `DELETE /api/tours/{id}/images/{imageId}` | DeleteImage                                           |

## Key data rules

- `heatmapData` is excluded from list endpoints and from Cosmos indexing.
- GPX > 5,000 trackpoints is downsampled before storing (keeps docs < 2 MB).
- Image GPS (EXIF) is read from the original before resize strips it; stored as
  `lat`/`lon` on the image record and used for map pins.

See [Design decisions](../explanation/design-decisions.md) for the _why_.
