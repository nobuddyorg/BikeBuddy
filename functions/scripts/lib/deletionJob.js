'use strict';

const { isUuid } = require('../../src/lib/validation');
const { queryItems } = require('./queryItems');
const { requireEnvironment, parseFlags, exitCodeOf } = require('./cli');

const GRAPH_USERS_URL = 'https://graph.microsoft.com/v1.0/users/';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const RESULT_LABELS = { deleted: 'deleted', alreadyGone: 'already gone' };

function partitionQueue(ids) {
  return {
    valid: ids.filter((id) => isUuid(id)),
    rejected: ids.filter((id) => !isUuid(id)),
  };
}

// Enough to follow one id through a run's log without publishing the object id.
function maskId(id) {
  return `…${id.slice(-4)}`;
}

function tokenUrl(tenantId) {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

function createGraphClient({ fetch, tenantId, clientId, clientSecret }) {
  let accessTokenPromise;

  async function requestAccessToken() {
    const response = await fetch(tokenUrl(tenantId), {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: GRAPH_SCOPE,
        grant_type: 'client_credentials',
      }),
    });
    if (!response.ok) throw new Error(`Graph token request failed with status ${response.status}`);
    const { access_token: accessToken } = await response.json();
    if (typeof accessToken !== 'string')
      throw new Error('Graph token response has no access_token');
    return accessToken;
  }

  async function deleteUser(objectId) {
    // The adapter holding the tenant-wide credential guards itself, not only its caller.
    if (!isUuid(objectId)) throw new Error('Refusing a Graph call for an id that is not a GUID');
    accessTokenPromise ??= requestAccessToken();
    const response = await fetch(GRAPH_USERS_URL + encodeURIComponent(objectId), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await accessTokenPromise}` },
    });
    if (response.status === 204) return 'deleted';
    if (response.status === 404) return 'alreadyGone';
    throw new Error(`Graph delete failed with status ${response.status}`);
  }

  return { deleteUser };
}

function createDeletionQueue(container) {
  return {
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

async function readQueue({ queue, log }) {
  const { valid, rejected } = partitionQueue(await queue.listIds());
  if (rejected.length > 0) {
    log.error(
      `${rejected.length} queued id(s) are not GUIDs: left in the queue, never sent to Graph.`,
    );
  }
  return { valid, rejected };
}

async function planDeletions({ queue, log }) {
  const { valid, rejected } = await readQueue({ queue, log });
  for (const id of valid) log.info(`Would delete ${maskId(id)}`);
  log.info(
    `Dry run, nothing changed: ${valid.length} would be deleted, ${rejected.length} rejected.`,
  );
  return { deleted: 0, alreadyGone: 0, failed: 0, rejected: rejected.length };
}

async function deleteQueuedUser({ id, queue, graph, log }) {
  try {
    const result = await graph.deleteUser(id);
    await queue.remove(id);
    log.info(`${maskId(id)}: ${RESULT_LABELS[result]}`);
    return result;
  } catch (error) {
    const reason = String(error.message).replaceAll(id, maskId(id));
    log.error(`${maskId(id)}: failed, stays queued for the next run (${reason})`);
    return 'failed';
  }
}

async function processDeletions({ queue, graph, log }) {
  const { valid, rejected } = await readQueue({ queue, log });
  const outcome = { deleted: 0, alreadyGone: 0, failed: 0, rejected: rejected.length };
  for (const id of valid) {
    outcome[await deleteQueuedUser({ id, queue, graph, log })] += 1;
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

async function runDeletions({ argv, environment, fetch, openDeletionsContainer, log }) {
  const { 'dry-run': dryRun } = parseFlags(argv, ['dry-run']);
  requireEnvironment(environment, ['COSMOS_CONNECTION_STRING', 'COSMOS_DATABASE']);
  const queue = createDeletionQueue(openDeletionsContainer());
  if (dryRun) return planDeletions({ queue, log });
  const graph = createGraphClient({ fetch, ...graphCredentials(environment) });
  return processDeletions({ queue, graph, log });
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
  maskId,
  createGraphClient,
  createDeletionQueue,
  planDeletions,
  processDeletions,
  runDeletionJob,
};
