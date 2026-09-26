// @ts-check
'use strict';

const db = require('./db');
const { ERROR_KEYS, error } = require('./http');

/**
 * 410 for a caller whose account deletion is queued: until the job removes the identity, a sign-in
 * must not create a profile or tours that nothing would ever delete. Only an Entra user has an oid.
 *
 * @param {{ userOid?: string | null }} user
 * @param {() => any} deletionsContainer
 * @returns {Promise<object | null>} the response to send, or null to carry on
 */
async function refusePendingDeletion(user, deletionsContainer) {
  if (!user.userOid) return null;
  const queued = await db.readItem(deletionsContainer(), {
    id: user.userOid,
    partitionKey: user.userOid,
  });
  return queued ? error(410, ERROR_KEYS.accountDeleted) : null;
}

module.exports = { refusePendingDeletion };
