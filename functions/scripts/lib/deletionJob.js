'use strict';

const { createHash } = require('node:crypto');
const { isUuid } = require('../../src/lib/validation');
const { queryItems } = require('./queryItems');
const { requireEnvironment, parseFlags, exitCodeOf } = require('./cli');
const { createGraphClient } = require('./graphClient');

const RESULT_LABELS = { deleted: 'deleted', alreadyGone: 'already gone' };

function partitionQueue(ids) {
  return {
    valid: ids.filter((id) => isUuid(id)),
    rejected: ids.filter((id) => !isUuid(id)),
  };
}

// A stable handle to follow one id through a run's public log, holding none of the id (#570).
function idHash(id) {
  return `id#${createHash('sha256').update(id).digest('hex').slice(0, 8)}`;
}

function createDeletionQueue(container) {
  return {
    async appUserOf(id) {
      try {
        const { resource } = await container.item(id, id).read();
        return resource?.userId;
      } catch (error) {
        if (error.code !== 404) throw error;
        return undefined;
      }
    },
    async listIds() {
      const ids = [];
      for await (const { id } of queryItems(container, 'SELECT c.id FROM c')) ids.push(id);
      return ids;
    },
    async remove(id) {
      try {
        await container.item(id, id).delete();
      } catch (error) {
        if (error.code !== 404) throw error;
      }
    },
  };
}

// The users container, partitioned by /id: whether the app still holds a user's document.
function createAppUsers(container) {
  return {
    async exists(userId) {
      try {
        const { resource } = await container.item(userId, userId).read();
        return resource !== undefined;
      } catch (error) {
        if (error.code !== 404) throw error;
        return false;
      }
    },
  };
}

// The app's user id is a token `sub`: never empty and never a path, so it cannot widen a blob prefix.
const APP_USER_ID_PATTERN = /^[\w-]{1,128}$/;

/**
 * What the job can check before it deletes an identity (#570): the entry names the app user it was
 * queued for, and that user's document is gone, as DeleteAccount leaves it. Anyone holding the
 * Cosmos key could still write both; only a signature the API alone can make would prove more.
 *
 * @returns {Promise<{ refusal: string } | { userId: string, refusal: '' }>} a refusal, or the
 *   app user to purge
 */
async function verifyEntry({ id, queue, appUsers }) {
  const userId = await queue.appUserOf(id);
  if (userId === undefined) {
    return { refusal: 'it names no app user, so nothing shows the API queued it' };
  }
  if (typeof userId !== 'string' || !APP_USER_ID_PATTERN.test(userId)) {
    return { refusal: 'its app user id is not a token subject' };
  }
  if (await appUsers.exists(userId)) {
    return { refusal: 'its app user still has a document, so the API did not delete it' };
  }
  return { userId, refusal: '' };
}

async function readQueue({ queue, log }) {
  const { valid, rejected } = partitionQueue(await queue.listIds());
  if (rejected.length > 0) {
    log.error(
      `${rejected.length} queued id(s) are not GUIDs: left in the queue, never sent to Graph.`,
    );
  }
  return { valid, rejected };
}

async function planDeletions({ queue, appUsers, log }) {
  const { valid, rejected } = await readQueue({ queue, log });
  let refused = 0;
  for (const id of valid) {
    const { refusal } = await verifyEntry({ id, queue, appUsers });
    if (refusal) refused += 1;
    log.info(
      refusal
        ? `Would reject ${idHash(id)}: ${refusal}`
        : `Would purge the app data of and delete ${idHash(id)}`,
    );
  }
  const total = rejected.length + refused;
  log.info(
    `Dry run, nothing changed: ${valid.length - refused} would be deleted, ${total} rejected.`,
  );
  return { deleted: 0, alreadyGone: 0, failed: 0, rejected: total };
}

// Neither id reaches the public log, not even inside an error from the SDK or Graph.
const withoutIds = (message, ids) =>
  ids.reduce((text, id) => text.replaceAll(id, idHash(id)), String(message));

// Purged again before the identity goes: anything written since the API's purge (a second device,
// a sign-in on another path) would otherwise outlive the account with no owner and no job to find it.
async function deleteQueuedUser({ id, queue, appUsers, graph, purgeAccount, log }) {
  const knownIds = [id];
  try {
    const verified = await verifyEntry({ id, queue, appUsers });
    if (verified.refusal) {
      log.error(`${idHash(id)}: rejected, stays queued (${verified.refusal})`);
      return 'rejected';
    }
    const { userId } = verified;
    knownIds.push(userId);
    await purgeAccount(userId);
    const result = await graph.deleteUser(id);
    await queue.remove(id);
    log.info(`${idHash(id)}: ${RESULT_LABELS[result]}`);
    return result;
  } catch (error) {
    const reason = withoutIds(error.message, knownIds);
    log.error(`${idHash(id)}: failed, stays queued for the next run (${reason})`);
    return 'failed';
  }
}

async function processDeletions({ queue, appUsers, graph, purgeAccount, log }) {
  const { valid, rejected } = await readQueue({ queue, log });
  const outcome = { deleted: 0, alreadyGone: 0, failed: 0, rejected: rejected.length };
  for (const id of valid) {
    outcome[await deleteQueuedUser({ id, queue, appUsers, graph, purgeAccount, log })] += 1;
  }
  log.info(
    `Done: ${outcome.deleted} deleted, ${outcome.alreadyGone} already gone, ` +
      `${outcome.failed} failed, ${outcome.rejected} rejected.`,
  );
  return outcome;
}

function graphCredentials(environment) {
  const variables = requireEnvironment(environment, [
    'GRAPH_TENANT_ID',
    'GRAPH_CLIENT_ID',
    'GRAPH_CLIENT_SECRET',
  ]);
  return {
    tenantId: variables.GRAPH_TENANT_ID,
    clientId: variables.GRAPH_CLIENT_ID,
    clientSecret: variables.GRAPH_CLIENT_SECRET,
  };
}

async function runDeletions({
  argv,
  environment,
  fetch,
  openDeletionsContainer,
  openUsersContainer,
  purgeAccount,
  log,
}) {
  const { 'dry-run': dryRun } = parseFlags(argv, ['dry-run']);
  requireEnvironment(environment, ['COSMOS_CONNECTION_STRING', 'COSMOS_DATABASE']);
  const queue = createDeletionQueue(openDeletionsContainer());
  const appUsers = createAppUsers(openUsersContainer());
  if (dryRun) return planDeletions({ queue, appUsers, log });
  requireEnvironment(environment, ['BLOB_CONNECTION_STRING']);
  const graph = createGraphClient({ fetch, ...graphCredentials(environment) });
  return processDeletions({ queue, appUsers, graph, purgeAccount, log });
}

// Resolves to the process exit code: non-zero when any id failed or was rejected.
function runDeletionJob(options) {
  return exitCodeOf({
    log: options.log,
    job: async () => {
      const { failed, rejected } = await runDeletions(options);
      return failed === 0 && rejected === 0;
    },
  });
}

module.exports = {
  partitionQueue,
  idHash,
  createDeletionQueue,
  createAppUsers,
  planDeletions,
  processDeletions,
  runDeletionJob,
};
