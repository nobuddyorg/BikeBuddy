// @ts-check
'use strict';

// Cosmos's per-request cap (db.js); a larger page would only cost the caller extra round trips.
const MAX_PAGE_SIZE = 100;
const LIMIT_PATTERN = /^[1-9]\d{0,2}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;
const OFFSET_PATTERN = /^[1-9]\d{0,6}$/;

/**
 * @typedef {{ kind: 'all' } | { kind: 'invalid' } |
 *   { kind: 'page', limit: number, offset: number }} PageRequest
 */

// Opaque to clients, and ours alone: nothing a client sends reaches Cosmos but a number.
const encodeOffset = (offset) => Buffer.from(String(offset)).toString('base64url');

function decodeOffset(token) {
  if (!TOKEN_PATTERN.test(token)) return Number.NaN;
  const decoded = Buffer.from(token, 'base64url').toString();
  return OFFSET_PATTERN.test(decoded) ? Number(decoded) : Number.NaN;
}

/**
 * What a list request asks for (#579): everything without `limit`; with it, up to `limit` items
 * from where `continuationToken` left off.
 *
 * @param {URLSearchParams} query
 * @returns {PageRequest}
 */
function pageRequest(query) {
  const limit = query.get('limit');
  const token = query.get('continuationToken');
  if (limit === null) return token === null ? { kind: 'all' } : { kind: 'invalid' };
  if (!LIMIT_PATTERN.test(limit) || Number(limit) > MAX_PAGE_SIZE) return { kind: 'invalid' };
  const offset = token === null ? 0 : decodeOffset(token);
  if (Number.isNaN(offset)) return { kind: 'invalid' };
  return { kind: 'page', limit: Number(limit), offset };
}

/**
 * A page's body: its items, and the token for the next page while there is one.
 *
 * @param {{ items: unknown[], page: { limit: number, offset: number }, more: boolean }} result
 */
const pageBody = ({ items, page, more }) => ({
  items,
  ...(more && { continuationToken: encodeOffset(page.offset + page.limit) }),
});

module.exports = { MAX_PAGE_SIZE, pageRequest, pageBody };
