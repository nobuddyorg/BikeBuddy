// @ts-check
'use strict';

// Load-test instrumentation (docs/how-to/load-testing.md, "Backend report").
// Off unless LOAD_PROFILING=true, which only the local load-test stack sets:
// production never loads the hooks, the Cosmos plugin or the blob client wrapper.
// Every record is one `LOADPROF {json}` line in the Functions host log, which
// load/backend-report.mjs aggregates after a run.

const { AsyncLocalStorage } = require('node:async_hooks');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const PREFIX = 'LOADPROF ';
const SAMPLE_INTERVAL_MS = 5000;

const enabled = () => process.env.LOAD_PROFILING === 'true';
const invocation = new AsyncLocalStorage();

/** @param {Record<string, unknown>} record */
function emit(record, write = console.log) {
  write(PREFIX + JSON.stringify(record));
}

const currentHandler = () => invocation.getStore()?.handler ?? 'none';

/** Response body size in bytes, as the host will serialise it. */
function bodyBytes(result) {
  if (!result || typeof result !== 'object') return 0;
  if (result.jsonBody !== undefined) return Buffer.byteLength(JSON.stringify(result.jsonBody));
  if (typeof result.body === 'string' || Buffer.isBuffer(result.body)) {
    return Buffer.byteLength(result.body);
  }
  return 0;
}

/**
 * Wraps every invocation: runs it inside the handler's async context (so Cosmos
 * and Blob records know their handler) and records status, duration and bytes.
 */
function registerInvocationHooks(app, now = () => performance.now(), write = console.log) {
  app.hook.preInvocation((context) => {
    const handler = context.invocationContext.functionName;
    const original = context.functionHandler;
    context.hookData.startedAt = now();
    context.functionHandler = (...args) => invocation.run({ handler }, () => original(...args));
  });
  app.hook.postInvocation((context) => {
    const result = /** @type {{ status?: number }} */ (context.result);
    emit(
      {
        type: 'invocation',
        handler: context.invocationContext.functionName,
        status: context.error ? 500 : (result?.status ?? 200),
        ms: now() - Number(context.hookData.startedAt),
        bytes: bodyBytes(context.result),
      },
      write,
    );
  });
}

/** Event-loop delay and memory, sampled every few seconds while the host runs. */
function startSampling(write = console.log, intervalMs = SAMPLE_INTERVAL_MS) {
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const timer = setInterval(() => {
    const memory = process.memoryUsage();
    emit(
      {
        type: 'sample',
        loopP50Ms: delay.percentile(50) / 1e6,
        loopP99Ms: delay.percentile(99) / 1e6,
        loopMaxMs: delay.max / 1e6,
        rssMb: memory.rss / 2 ** 20,
        heapUsedMb: memory.heapUsed / 2 ** 20,
      },
      write,
    );
    delay.reset();
  }, intervalMs);
  timer.unref();
  return timer;
}

/**
 * Cosmos SDK plugin (CosmosClientOptions.plugins, `on: 'request'`): one record
 * per HTTP request (each query page and retry counts, which `operation` plugins
 * miss for queries) with its request charge. Note: the vnext emulator reports
 * nominal charges, so RU numbers are only meaningful against a real account.
 */
function cosmosPlugin(write = console.log, now = () => performance.now()) {
  return async (context, diagnosticNode, next) => {
    const startedAt = now();
    const response = await next(context);
    emit(
      {
        type: 'cosmos',
        handler: currentHandler(),
        op: `${context.operationType ?? '?'} ${context.resourceType ?? '?'}`,
        ru: Number(response.headers?.['x-ms-request-charge'] ?? 0),
        ms: now() - startedAt,
      },
      write,
    );
    return response;
  };
}

/**
 * Storage request policy factory (a storage-blob Pipeline factory, which the SDK
 * wraps as a downlevel policy): one record per Blob Storage request.
 */
function blobPolicyFactory(write = console.log) {
  return {
    create: (nextPolicy) => ({
      async sendRequest(webResource) {
        // Path-style URLs (Azurite, the only place this runs): /<account>/<container>[/<blob>].
        const [, , , ...blobPath] = new URL(webResource.url).pathname.split('/');
        const record = (status) =>
          emit(
            {
              type: 'blob',
              handler: currentHandler(),
              op: `${webResource.method} ${blobPath.join('/') ? 'blob' : 'container'}`,
              status,
            },
            write,
          );
        try {
          const response = await nextPolicy.sendRequest(webResource);
          record(response.status);
          return response;
        } catch (error) {
          // A 409 from createIfNotExists or a 404 from deleteIfExists is still a request.
          record(/** @type {{ statusCode?: number }} */ (error).statusCode ?? 0);
          throw error;
        }
      },
    }),
  };
}

module.exports = {
  PREFIX,
  enabled,
  emit,
  bodyBytes,
  registerInvocationHooks,
  startSampling,
  cosmosPlugin,
  blobPolicyFactory,
  currentHandler,
};
