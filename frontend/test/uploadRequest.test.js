import { describe, it, expect } from 'vitest';
import { xhrUpload } from '../src/ui/uploadRequest.js';
import { runWithConcurrency } from '../src/lib/concurrency.js';

// Minimal XMLHttpRequest stand-in that delivers the terminal event under test.
function makeRequest({ status = 201, responseText = '{}', event = 'load' } = {}) {
  const calls = { headers: {}, sent: false };
  class FakeRequest {
    constructor() {
      this.upload = {};
      this.status = status;
      this.responseText = responseText;
      FakeRequest.instance = this;
    }
    open(method, url) {
      calls.method = method;
      calls.url = url;
    }
    setRequestHeader(name, value) {
      calls.headers[name] = value;
    }
    send() {
      calls.sent = true;
      // Deliver the terminal event asynchronously, as a real XHR would.
      queueMicrotask(() => this[`on${event}`]?.());
    }
  }
  return { FakeRequest, calls };
}

const upload = ({ RequestConstructor, token = '', onProgress = () => {} }) =>
  xhrUpload({
    url: '/api/x',
    file: new File(['<gpx/>'], 'tour.gpx', { type: 'application/gpx+xml' }),
    token,
    onProgress,
    RequestConstructor,
  });

describe('xhrUpload', () => {
  it('resolves with the parsed body on 201', async () => {
    const { FakeRequest, calls } = makeRequest({ responseText: '{"id":"img-1"}' });

    await expect(upload({ RequestConstructor: FakeRequest, token: 'tok' })).resolves.toEqual({
      id: 'img-1',
    });
    expect(calls.method).toBe('POST');
    expect(calls.url).toBe('/api/x');
    expect(calls.headers.Authorization).toBe('Bearer tok');
  });

  it('omits the Authorization header when there is no token', async () => {
    const { FakeRequest, calls } = makeRequest();

    await upload({ RequestConstructor: FakeRequest });
    expect(calls.headers.Authorization).toBeUndefined();
  });

  it('rejects with the server message on a non-201', async () => {
    const { FakeRequest } = makeRequest({ status: 400, responseText: '{"error":"Too big"}' });

    await expect(upload({ RequestConstructor: FakeRequest })).rejects.toThrow('Too big');
  });

  // The bug: JSON.parse threw inside xhr.onload, which escapes to the global
  // error handler rather than rejecting, so the promise never settled.
  it('rejects rather than hanging when a 201 body is not valid JSON', async () => {
    const { FakeRequest } = makeRequest({ status: 201, responseText: '<html>proxy</html>' });

    await expect(upload({ RequestConstructor: FakeRequest })).rejects.toThrow(
      'errors.uploadUnreadable',
    );
  });

  it.each([
    ['error', 'errors.uploadNetwork'],
    ['abort', 'errors.uploadCancelled'],
    ['timeout', 'errors.uploadTimeout'],
  ])('settles on %s', async (event, message) => {
    const { FakeRequest } = makeRequest({ event });

    await expect(upload({ RequestConstructor: FakeRequest })).rejects.toThrow(message);
  });

  it('reports progress as a rounded percentage', async () => {
    const { FakeRequest } = makeRequest();
    const seen = [];
    const pending = upload({
      RequestConstructor: FakeRequest,
      onProgress: (percent) => seen.push(percent),
    });

    FakeRequest.instance.upload.onprogress({ lengthComputable: true, loaded: 1, total: 3 });
    FakeRequest.instance.upload.onprogress({ lengthComputable: false, loaded: 2, total: 3 });
    await pending;

    expect(seen).toEqual([33]);
  });

  // The consequence that made the hang severe: an unsettled promise holds its
  // slot in the pool forever, so enough of them deadlock all remaining uploads.
  it('does not stall the concurrency pool when responses are unparsable', async () => {
    const { FakeRequest } = makeRequest({ status: 201, responseText: 'not json' });
    const failures = [];

    await runWithConcurrency({
      items: [1, 2, 3, 4, 5],
      limit: 3,
      worker: async (item) => {
        try {
          await upload({ RequestConstructor: FakeRequest });
        } catch {
          failures.push(item);
        }
      },
    });

    expect(failures).toHaveLength(5);
  });
});
