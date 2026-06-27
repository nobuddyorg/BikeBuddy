'use strict';

// Drain the `deletions` queue (Entra directory object ids written by the API on
// account deletion) by deleting each user from the External ID tenant via Graph.
// Runs out-of-band (scheduled GitHub Action) so the public API never holds the
// privileged "delete any user" credential. Idempotent and safe to re-run.
//
// Env: COSMOS_CONNECTION_STRING, COSMOS_DATABASE, GRAPH_TENANT_ID,
//      GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET (CIAM app with User.ReadWrite.All).

const { CosmosClient } = require('@azure/cosmos');

const connectionString = process.env.COSMOS_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DATABASE || 'bikebuddy';
const tenantId = process.env.GRAPH_TENANT_ID;
const clientId = process.env.GRAPH_CLIENT_ID;
const clientSecret = process.env.GRAPH_CLIENT_SECRET;

async function graphToken() {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Graph token request failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function deleteUser(token, oid) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${oid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.status; // 204 deleted, 404 already gone (both terminal)
}

async function main() {
  if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING is required');
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('GRAPH_TENANT_ID, GRAPH_CLIENT_ID and GRAPH_CLIENT_SECRET are required');
  }

  const container = new CosmosClient(connectionString).database(databaseId).container('deletions');
  const { resources } = await container.items.query('SELECT c.id FROM c').fetchAll();
  if (resources.length === 0) {
    console.log('No pending deletions.');
    return;
  }

  const token = await graphToken();
  let deleted = 0;
  let failed = 0;
  for (const { id } of resources) {
    const status = await deleteUser(token, id);
    if (status === 204 || status === 404) {
      await container.item(id, id).delete();
      console.log(`Deleted Entra user ${id} (status ${status}).`);
      deleted++;
    } else {
      console.error(`Failed to delete Entra user ${id}: status ${status} (will retry next run).`);
      failed++;
    }
  }
  console.log(`Done: ${deleted} deleted, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Deletion job failed:', err.message);
  process.exitCode = 1;
});
