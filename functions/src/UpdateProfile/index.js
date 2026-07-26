'use strict';

const { app } = require('@azure/functions');
const { z } = require('zod');
const { authenticate } = require('../middleware/authMiddleware');
const { usersContainer, readItem } = require('../lib/db');
const { nameSchema, languageSchema } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');

// Independently optional: a brand-new account has no name yet, so a language
// preference must be savable before one is ever set. One of the two is required.
const profileSchema = z
  .object({ name: nameSchema.optional(), language: languageSchema.optional() })
  .refine((data) => data.name !== undefined || data.language !== undefined, {
    message: 'A name or a language is required.',
  });

// PATCH /api/me — External ID's self-service sign-up doesn't reliably collect a
// display name, so BikeBuddy owns it. The user doc is created here if missing.
async function updateProfile(request, auth = authenticate, getContainer = usersContainer) {
  const user = await auth(request);
  if (!user) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    // invalid/empty JSON — fails validation below
  }
  const parsed = profileSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return error(400, 'A name (1–200 characters) or a supported language is required.');
  }

  const { userId, userEmail } = user;
  const container = getContainer();

  let doc = await readItem(container, userId, userId);
  if (!doc) {
    doc = {
      id: userId,
      name: parsed.data.name ?? null,
      email: userEmail,
      createdAt: new Date().toISOString(),
    };
  }
  if (parsed.data.name !== undefined) doc.name = parsed.data.name;
  if (parsed.data.language !== undefined) doc.language = parsed.data.language;
  ({ resource: doc } = await container.items.upsert(doc));

  return {
    status: 200,
    jsonBody: {
      id: doc.id,
      name: doc.name,
      email: doc.email,
      createdAt: doc.createdAt,
      language: doc.language,
    },
  };
}

app.http('UpdateProfile', {
  methods: ['patch'],
  authLevel: 'anonymous',
  route: 'me',
  /* v8 ignore next */
  handler: (request) => updateProfile(request),
});

module.exports = { updateProfile };
