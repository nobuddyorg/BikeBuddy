'use strict';

const { z } = require('zod');
const { error } = require('./http');

const stripHtml = (s) => s.replace(/[<>]/g, '').trim();

// Stripped first, then length-checked.
const nameSchema = z.string().transform(stripHtml).pipe(z.string().min(1).max(200));
const descriptionSchema = z.string().transform(stripHtml).pipe(z.string().max(2000));

// createdAt is edit-only — never accepted on create/upload.
const tourMetaSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema.optional(),
  createdAt: z.iso.datetime().optional(),
});

// The frontend renders an error body verbatim, so these are i18n keys, not
// prose: Zod's own wording is English-only, describes the schema rather than the
// fix, and changes with the library (#359). Keys live in frontend/src/locales/.
const TOUR_META_ERROR_KEYS = {
  name: 'errors.tourName',
  description: 'errors.tourDescription',
  createdAt: 'errors.tourDate',
};

// A body that isn't an object at all has no field path, hence the generic key.
function tourMetaError(zodError) {
  const field = zodError.issues[0]?.path?.[0];
  return error(400, TOUR_META_ERROR_KEYS[field] ?? 'errors.tourInvalid');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Returns a 400 response for the first non-UUID param, or null when all pass.
function uuidParamError(params) {
  for (const [key, value] of Object.entries(params)) {
    if (!isUuid(value)) return error(400, `Invalid ${key}`);
  }
  return null;
}

// Kept in step by hand with frontend/src/lib/i18n.js's SUPPORTED_LOCALES:
// separate deployables, no shared module.
const SUPPORTED_LANGUAGE_CODES = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt'];
const languageSchema = z.enum(SUPPORTED_LANGUAGE_CODES);

const isImageContentType = (mime) => mime === 'image/jpeg' || mime === 'image/png';

module.exports = {
  stripHtml,
  nameSchema,
  tourMetaSchema,
  tourMetaError,
  isUuid,
  uuidParamError,
  isImageContentType,
  languageSchema,
  SUPPORTED_LANGUAGE_CODES,
};
