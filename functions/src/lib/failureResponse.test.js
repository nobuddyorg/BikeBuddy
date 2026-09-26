'use strict';

const { withFailureResponse } = require('./failureResponse');

const invocation = () => ({ invocationId: 'invocation-1', error: vi.fn() });

describe('withFailureResponse', () => {
  it("passes the handler's own response through", async () => {
    const response = { status: 204 };

    expect(await withFailureResponse(async () => response)({}, invocation())).toBe(response);
  });

  it('hands the handler its request and invocation context', async () => {
    const handler = vi.fn(async () => ({ status: 200 }));
    const request = { params: {} };
    const context = invocation();

    await withFailureResponse(handler)(request, context);

    expect(handler).toHaveBeenCalledWith(request, context);
  });

  it('answers an unexpected failure with a JSON 500 and the invocation id, never its text', async () => {
    const context = invocation();
    const failure = new Error('connect ECONNREFUSED 10.0.0.4:443 account=bikebuddy');

    const response = await withFailureResponse(async () => {
      throw failure;
    })({}, context);

    expect(response).toStrictEqual({
      status: 500,
      jsonBody: { error: 'errors.unexpected', invocationId: 'invocation-1' },
    });
    expect(context.error).toHaveBeenCalledWith(failure);
  });

  it('answers Cosmos throttling after its retries with 503 and Retry-After', async () => {
    const context = invocation();
    const throttled = Object.assign(new Error('Request rate is large'), { code: 429 });

    const response = await withFailureResponse(async () => {
      throw throttled;
    })({}, context);

    expect(response).toStrictEqual({
      status: 503,
      headers: { 'Retry-After': '5' },
      jsonBody: { error: 'errors.busy', invocationId: 'invocation-1' },
    });
    expect(context.error).toHaveBeenCalledWith(throttled);
  });

  it('answers a thrown non-Error value with a JSON 500 too', async () => {
    const response = await withFailureResponse(async () => {
      throw undefined;
    })({}, invocation());

    expect(response.status).toBe(500);
  });
});
