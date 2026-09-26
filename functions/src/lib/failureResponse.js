// @ts-check
'use strict';

const { ERROR_KEYS } = require('./http');

// Cosmos answers 429 once the SDK's own retries run out: the client may try again shortly.
const THROTTLED = 429;
const RETRY_AFTER_SECONDS = '5';

/**
 * An unexpected failure answers JSON with the invocation id to quote, never the host's bare 500
 * and never the failure's own text; the log gets the details.
 *
 * @param {(request: any, context: any) => Promise<object> | object} handler
 */
function withFailureResponse(handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (failure) {
      context.error(failure);
      const throttled = /** @type {{ code?: unknown } | undefined} */ (failure)?.code === THROTTLED;
      return {
        status: throttled ? 503 : 500,
        ...(throttled && { headers: { 'Retry-After': RETRY_AFTER_SECONDS } }),
        jsonBody: {
          error: throttled ? ERROR_KEYS.busy : ERROR_KEYS.unexpected,
          invocationId: context.invocationId,
        },
      };
    }
  };
}

module.exports = { withFailureResponse };
