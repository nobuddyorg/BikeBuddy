// @ts-check
'use strict';

// Load-test instrumentation (docs/how-to/load-testing.md, "Backend report"):
// each record is one `LOADPROF {json}` line in the Functions host log.

const { AsyncLocalStorage } = require('node:async_hooks');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const PREFIX = 'LOADPROF ';
const SAMPLE_INTERVAL_MS = 5000;
const NANOSECONDS_PER_MILLISECOND = 1e6;
const BYTES_PER_MEGABYTE = 2 ** 20;

/** @param {Record<string, string | undefined>} environment */
const isEnabled = (environment) => environment.LOAD_PROFILING === 'true';
const invocation = new AsyncLocalStorage();

/** @param {Record<string, unknown>} record @param {(line: string) => void} write */
function emit(record, write) {
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

// Cosmos and Blob records find their handler through the async context set here.
function registerInvocationHooks(app, { now, write }) {
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

function startSampling({ write, readMemory, intervalMs = SAMPLE_INTERVAL_MS }) {
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const timer = setInterval(() => {
    const memory = readMemory();
    emit(
      {
        type: 'sample',
        loopP50Ms: delay.percentile(50) / NANOSECONDS_PER_MILLISECOND,
        loopP99Ms: delay.percentile(99) / NANOSECONDS_PER_MILLISECOND,
        loopMaxMs: delay.max / NANOSECONDS_PER_MILLISECOND,
        rssMb: memory.rss / BYTES_PER_MEGABYTE,
        heapUsedMb: memory.heapUsed / BYTES_PER_MEGABYTE,
      },
      write,
    );
    delay.reset();
  }, intervalMs);
  timer.unref();
  return timer;
}

// An `on: 'request'` plugin sees every HTTP request, including each query page
// and retry, which `operation` plugins miss. The emulator's charges are nominal.
function cosmosPlugin({ write, now }) {
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

// A storage-blob pipeline factory, which the SDK wraps as a downlevel policy.
function blobPolicyFactory(write) {
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
  isEnabled,
  emit,
  bodyBytes,
  registerInvocationHooks,
  startSampling,
  cosmosPlugin,
  blobPolicyFactory,
  currentHandler,
};
