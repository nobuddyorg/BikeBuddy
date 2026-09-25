'use strict';

const { app } = require('@azure/functions');
const { z } = require('zod');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const system = require('../lib/system');
const { nameSchema, languageSchema } = require('../lib/validation');
const { profileFromClaims, newUserDocument, toUserResponse } = require('../lib/userProfile');
const { unauthorized, error } = require('../lib/http');

// A brand-new account has no name yet, so a language must be savable alone.
const profileSchema = z
  .object({ name: nameSchema.optional(), language: languageSchema.optional() })
  .refine((data) => data.name !== undefined || data.language !== undefined, {
    message: 'A name or a language is required.',
  });
const INVALID_PROFILE = 'A name (1–200 characters) or a supported language is required.';

// Malformed JSON reads as an empty body, which the schema then refuses.
async function readJsonBody(request) {
  try {
    return (await request.json()) ?? {};
  } catch (parseError) {
    if (!(parseError instanceof SyntaxError)) throw parseError;
    return {};
  }
}

// External ID's sign-up may not collect a name, so the profile may not exist yet.
async function updateProfile(
  request,
  {
    authenticate = authMiddleware.authenticate,
    usersContainer = db.usersContainer,
    now = system.currentTime,
  } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();

  const parsed = profileSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return error(400, INVALID_PROFILE);

  const { userId } = user;
  const container = usersContainer();
  const stored =
    (await db.readItem(container, { id: userId, partitionKey: userId })) ??
    newUserDocument({
      userId,
      profile: { ...profileFromClaims(user), name: null },
      createdAt: now(),
    });
  const updated = await db.upsertItem(container, { ...stored, ...parsed.data });

  return { status: 200, jsonBody: toUserResponse(updated) };
}

app.http('UpdateProfile', {
  methods: ['patch'],
  authLevel: 'anonymous',
  route: 'me',
  /* v8 ignore next */
  handler: (request) => updateProfile(request),
});

module.exports = { updateProfile };
