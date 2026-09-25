import { describe, it, expect } from 'vitest';
import { xhrUpload } from '../src/ui/uploadRequest.js';
import { runWithConcurrency } from '../src/lib/concurrency.js';

// Minimal XMLHttpRequest stand-in. `fire` drives whichever terminal event the
// test is exercising; nothing happens until it is called.
function makeXhr({ status = 201, responseText = '{}', event = 'load' } = {}) {
  const calls = { headers: {}, sent: false };
  class FakeXhr {
    constructor() {
      this.upload = {};
      this.status = status;
      this.responseText = responseText;
      FakeXhr.instance = this;
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
  return { FakeXhr, calls };
}

const file = () => new File(['<gpx/>'], 'tour.gpx', { type: 'application/gpx+xml' });
const noop = () => {};

describe('xhrUpload', () => {
  it('resolves with the parsed body on 201', async () => {
    const { FakeXhr, calls } = makeXhr({ responseText: '{"id":"img-1"}' });

    await expect(xhrUpload('/api/x', file(), 'tok', noop, FakeXhr)).resolves.toEqual({
      id: 'img-1',
    });
    expect(calls.method).toBe('POST');
    expect(calls.headers.Authorization).toBe('Bearer tok');
  });

  it('omits the Authorization header when there is no token', async () => {
    const { FakeXhr, calls } = makeXhr();

    await xhrUpload('/api/x', file(), null, noop, FakeXhr);
    expect(calls.headers.Authorization).toBeUndefined();
  });

  it('rejects with the server message on a non-201', async () => {
    const { FakeXhr } = makeXhr({ status: 400, responseText: '{"error":"Too big"}' });

    await expect(xhrUpload('/api/x', file(), null, noop, FakeXhr)).rejects.toThrow('Too big');
  });

  // The bug: JSON.parse threw inside xhr.onload, which escapes to the global
  // error handler rather than rejecting, so the promise never settled.
  it('rejects rather than hanging when a 201 body is not valid JSON', async () => {
    const { FakeXhr } = makeXhr({ status: 201, responseText: '<html>proxy</html>' });

    await expect(xhrUpload('/api/x', file(), null, noop, FakeXhr)).rejects.toThrow(
      'errors.uploadUnreadable',
    );
  });

  it.each([
    ['error', 'errors.uploadNetwork'],
    ['abort', 'errors.uploadCancelled'],
    ['timeout', 'errors.uploadTimeout'],
  ])('settles on %s', async (event, message) => {
    const { FakeXhr } = makeXhr({ event });

    await expect(xhrUpload('/api/x', file(), null, noop, FakeXhr)).rejects.toThrow(message);
  });

  it('reports progress as a rounded percentage', async () => {
    const { FakeXhr } = makeXhr();
    const seen = [];
    const pending = xhrUpload('/api/x', file(), null, (p) => seen.push(p), FakeXhr);

    FakeXhr.instance.upload.onprogress({ lengthComputable: true, loaded: 1, total: 3 });
    FakeXhr.instance.upload.onprogress({ lengthComputable: false, loaded: 2, total: 3 });
    await pending;

    expect(seen).toEqual([33]);
  });

  // The consequence that made the hang severe: an unsettled promise holds its
  // slot in the pool forever, so enough of them deadlock all remaining uploads.
  it('does not stall the concurrency pool when responses are unparsable', async () => {
    const { FakeXhr } = makeXhr({ status: 201, responseText: 'not json' });
    const outcomes = [];

    await runWithConcurrency([1, 2, 3, 4, 5], 3, async (n) => {
      try {
        await xhrUpload('/api/x', file(), null, noop, FakeXhr);
      } catch {
        outcomes.push(n);
      }
    });

    expect(outcomes).toHaveLength(5);
  });
});
