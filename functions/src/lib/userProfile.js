// @ts-check
'use strict';

const { nameSchema, stripHtml } = require('./validation');
const { USER_SCHEMA_VERSION } = require('./schemaVersion');

const MAX_PROFILE_TEXT_LENGTH = 200;

/**
 * Cleaned like a typed name, but cut to 200 characters instead of refused; null if nothing is left.
 *
 * @param {unknown} claim
 * @returns {string | null}
 */
function profileTextFromClaim(claim) {
  if (typeof claim !== 'string') return null;
  const parsed = nameSchema.safeParse(stripHtml(claim).slice(0, MAX_PROFILE_TEXT_LENGTH));
  return parsed.success ? parsed.data : null;
}

/** @param {{ userName?: unknown, userEmail?: unknown }} user */
const profileFromClaims = (user) => ({
  name: profileTextFromClaim(user.userName),
  email: profileTextFromClaim(user.userEmail),
});

const isBlank = (value) => typeof value !== 'string' || value.trim() === '';

/**
 * Token values for the fields the stored profile leaves empty; a value the user set is kept.
 */
function missingProfileFields({ stored, claims }) {
  return Object.fromEntries(
    ['name', 'email']
      .filter((field) => isBlank(stored[field]) && claims[field] !== null)
      .map((field) => [field, claims[field]]),
  );
}

/** @param {{ userId: string, profile: { name: string | null, email: string | null }, createdAt: Date }} values */
const newUserDocument = ({ userId, profile, createdAt }) => ({
  id: userId,
  schemaVersion: USER_SCHEMA_VERSION,
  name: profile.name,
  email: profile.email,
  createdAt: createdAt.toISOString(),
});

const toUserResponse = (document) => ({
  id: document.id,
  name: document.name,
  email: document.email,
  createdAt: document.createdAt,
  language: document.language,
});

module.exports = { profileFromClaims, missingProfileFields, newUserDocument, toUserResponse };
