// @ts-check
'use strict';

const { z } = require('zod');
const { ERROR_KEYS, error } = require('./http');

const stripHtml = (text) => text.replace(/[<>]/g, '').trim();

// Length limits apply to the stripped text.
const nameSchema = z.string().transform(stripHtml).pipe(z.string().min(1).max(200));
const descriptionSchema = z.string().transform(stripHtml).pipe(z.string().max(2000));

// createdAt is editable but never accepted on upload.
const tourMetaSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema.optional(),
  createdAt: z.iso.datetime().optional(),
});

// The frontend shows these through i18n (frontend/src/locales/), never Zod's English.
const TOUR_META_ERROR_KEYS = {
  name: ERROR_KEYS.tourName,
  description: ERROR_KEYS.tourDescription,
  createdAt: ERROR_KEYS.tourDate,
};

function tourMetaError(zodError) {
  const [field] = zodError.issues[0].path;
  return error(400, TOUR_META_ERROR_KEYS[field] ?? ERROR_KEYS.tourInvalid);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

/** @param {Record<string, unknown>} params @returns {string[]} names of the non-UUID params */
function invalidIdParams(params) {
  return Object.entries(params)
    .filter(([, value]) => !isUuid(value))
    .map(([name]) => name);
}

// Kept in step by hand with frontend/src/lib/i18n.js's SUPPORTED_LOCALES.
const SUPPORTED_LANGUAGE_CODES = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt'];
const languageSchema = z.enum(SUPPORTED_LANGUAGE_CODES);

const isImageContentType = (contentType) =>
  contentType === 'image/jpeg' || contentType === 'image/png';

module.exports = {
  stripHtml,
  nameSchema,
  tourMetaSchema,
  tourMetaError,
  isUuid,
  invalidIdParams,
  isImageContentType,
  languageSchema,
  SUPPORTED_LANGUAGE_CODES,
};
