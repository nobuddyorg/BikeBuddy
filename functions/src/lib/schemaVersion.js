// @ts-check
'use strict';

/**
 * The shape new documents are written in. A document without `schemaVersion` predates versioning;
 * scripts/backfillSchemaVersion.js brings a tour up to 1 once the stats backfill has run on it.
 *
 * Tour 1: an `images` array and every stat field (null when the GPX has no such data).
 * User 1: id, name, email, createdAt, and `language` once one is chosen.
 */
const TOUR_SCHEMA_VERSION = 1;
const USER_SCHEMA_VERSION = 1;

module.exports = { TOUR_SCHEMA_VERSION, USER_SCHEMA_VERSION };
