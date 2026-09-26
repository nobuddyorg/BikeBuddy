'use strict';

// Identities, clock and id generator for handler tests.

const signedInAs =
  (userId, claims = {}) =>
  async () => ({ userId, ...claims });
const signedOut = async () => null;

const NOW = new Date('2026-03-01T12:00:00.000Z');
const fixedClock = () => new Date(NOW);

const idsInOrder = (...ids) => {
  const remaining = [...ids];
  return () => remaining.shift();
};

// A signed URL from the blob fake: which blob, what it permits, until when.
function signedUrlParts(url) {
  const parsed = new URL(url);
  return {
    path: parsed.pathname,
    permissions: parsed.searchParams.get('sp'),
    resource: parsed.searchParams.get('sr'),
    expiresOn: parsed.searchParams.get('se'),
    contentDisposition: parsed.searchParams.get('rscd'),
  };
}

module.exports = { signedInAs, signedOut, NOW, fixedClock, idsInOrder, signedUrlParts };
