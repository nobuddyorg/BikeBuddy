'use strict';

const { z } = require('zod');
const { error } = require('./http');

const stripHtml = (s) => s.replace(/[<>]/g, '').trim();

// User-facing text: stripped first, then length-checked.
const nameSchema = z.string().transform(stripHtml).pipe(z.string().min(1).max(200));
const descriptionSchema = z.string().transform(stripHtml).pipe(z.string().max(2000));

// name + description metadata for tour create (query) and edit (body).
const tourMetaSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema.optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Validate route params are UUIDs; returns a 400 response for the first invalid
// one, or null when all are valid.
function uuidParamError(params) {
  for (const [key, value] of Object.entries(params)) {
    if (!isUuid(value)) return error(400, `Invalid ${key}`);
  }
  return null;
}

// Must stay in sync with frontend/src/lib/i18n.js's SUPPORTED_LOCALES codes —
// separate deployables, no shared module, so this list is kept in step by hand.
const SUPPORTED_LANGUAGE_CODES = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt'];
const languageSchema = z.enum(SUPPORTED_LANGUAGE_CODES);

const isImageContentType = (mime) => mime === 'image/jpeg' || mime === 'image/png';

module.exports = {
  stripHtml,
  nameSchema,
  tourMetaSchema,
  isUuid,
  uuidParamError,
  isImageContentType,
  languageSchema,
  SUPPORTED_LANGUAGE_CODES,
};
