// @ts-check
'use strict';

/**
 * The shape new documents are written in. A document without `schemaVersion` predates versioning;
 * scripts/backfillSchemaVersion.js brings a tour up to 1 once the stats backfill has run on it.
 *
 * Tour 1: an `images` array and every stat field (null when the GPX has no such data).
 * Tour 2: as 1, with the points moved to the tour's track item and their number in `pointCount`;
 * a tour still holding `heatmapData` inline is read as before (scripts/backfillTracks.js moves it).
 * Tour 3: as 2, with the stored sizes the upload quota sums (#549): `gpxBytes` on the tour and
 * `bytes` (full size plus thumbnail) on each image entry. A size still missing counts as nothing
 * until scripts/backfillStoredBytes.js reads it from the blobs.
 * Track 1: the tour's id and userId, its points in `heatmapData`, and `segmentStarts`, the index
 * where each GPX segment after the first begins (empty for one segment).
 * User 1: id, name, email, createdAt, and `language` once one is chosen.
 */
const TOUR_SCHEMA_VERSION = 3;
const TRACK_SCHEMA_VERSION = 1;
const USER_SCHEMA_VERSION = 1;

module.exports = { TOUR_SCHEMA_VERSION, TRACK_SCHEMA_VERSION, USER_SCHEMA_VERSION };
