'use strict';

const { z } = require('zod');

// Remove angle-bracket tags and trim, so stored text can't carry HTML/script.
const stripHtml = (s) => s.replace(/<[^>]*>/g, '').trim();

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

// Validate route params are UUIDs; on failure set a 400 and return false.
function requireUuids(context, params) {
  for (const [key, value] of Object.entries(params)) {
    if (!isUuid(value)) {
      context.res = { status: 400, body: { error: `Invalid ${key}` } };
      return false;
    }
  }
  return true;
}

const isImageContentType = (mime) => mime === 'image/jpeg' || mime === 'image/png';

module.exports = {
  stripHtml,
  tourMetaSchema,
  isUuid,
  requireUuids,
  isImageContentType,
};
