import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

// sw.js is a classic worker script, not a module, so the list is read from its source.
const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../src');

const swSource = readFileSync(resolve(srcDir, 'sw.js'), 'utf8');
const match = swSource.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('sw.js: PRECACHE_URLS not found');
const PRECACHE_URLS = new Function(`return ${match[1]}`)();

function listFiles(dir, exts) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, exts);
    return exts.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

const relativePath = (full) =>
  full
    .slice(srcDir.length + 1)
    .split('\\')
    .join('/');

describe('service worker precache list', () => {
  it('includes every lib/ and ui/ module', () => {
    const jsFiles = [
      ...listFiles(join(srcDir, 'lib'), ['.js']),
      ...listFiles(join(srcDir, 'ui'), ['.js']),
    ].map(relativePath);
    for (const file of jsFiles) expect(PRECACHE_URLS).toContain(file);
  });

  it('includes every stylesheet and the icon sprite', () => {
    const assets = [...listFiles(join(srcDir, 'css'), ['.css']).map(relativePath), 'icons.svg'];
    expect(assets.length).toBeGreaterThan(1);
    for (const file of assets) expect(PRECACHE_URLS).toContain(file);
  });

  it('precaches the stylesheets in the order index.html links them', () => {
    const html = readFileSync(resolve(srcDir, 'index.html'), 'utf8');
    const linked = [...html.matchAll(/<link rel="stylesheet" href="(css\/[\w-]+\.css)"/g)].map(
      (match) => match[1],
    );
    expect(linked).toEqual(PRECACHE_URLS.filter((url) => url.startsWith('css/')));
  });

  it('includes every locale file', () => {
    const localeFiles = listFiles(join(srcDir, 'locales'), ['.json']).map(relativePath);
    for (const file of localeFiles) expect(PRECACHE_URLS).toContain(file);
  });

  // config.js is generated per deployment and gitignored.
  it('lists no file that is missing on disk', () => {
    for (const url of PRECACHE_URLS) {
      if (url === './' || url === 'config.js') continue;
      expect(existsSync(join(srcDir, url)), `${url} is listed but missing on disk`).toBe(true);
    }
  });
});

// Runs sw.js against a fake worker scope: its listeners, a Map for the cache, a stubbed network.
const SCOPE = 'https://nobuddy.org/BikeBuddy/';

function loadWorker(network) {
  const listeners = {};
  const cached = new Map();
  const keyOf = (request) =>
    new URL(typeof request === 'string' ? request : request.url, SCOPE).href;
  const cache = {
    add: async (request) => cached.set(keyOf(request), { request }),
    put: async (request, response) => cached.set(keyOf(request), { response }),
  };
  const caches = {
    open: async () => cache,
    match: async (request) => cached.get(keyOf(request))?.response,
    keys: async () => [],
    delete: async () => true,
  };
  class ScopedRequest extends Request {
    constructor(url, init) {
      super(new URL(url, SCOPE), init);
    }
  }
  const self = {
    location: new URL('sw.js', SCOPE),
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  new Function('self', 'caches', 'fetch', 'Request', swSource)(
    self,
    caches,
    network,
    ScopedRequest,
  );
  return { listeners, cached, keyOf };
}

// Resolves once the response and every waitUntil() it started have settled.
async function dispatchFetch(listeners, request) {
  let response;
  const extensions = [];
  listeners.fetch({
    request,
    respondWith: (promise) => {
      response = promise;
    },
    waitUntil: (promise) => extensions.push(promise),
  });
  if (!response) return undefined;
  const settled = await response;
  await Promise.all(extensions);
  return settled;
}

const offline = async () => {
  throw new TypeError('Failed to fetch');
};
const asset = (path, init) => new Request(new URL(path, SCOPE), init);

describe('service worker fetch strategy (#544)', () => {
  it('serves a module from the network and keeps the cache copy current', async () => {
    const worker = loadWorker(async () => new Response('fresh'));

    const response = await dispatchFetch(worker.listeners, asset('ui/sidebar.js'));

    expect(await response.text()).toBe('fresh');
    const stored = worker.cached.get(worker.keyOf(asset('ui/sidebar.js'))).response;
    expect(await stored.text()).toBe('fresh');
  });

  it('serves the cached copy only when the network fails', async () => {
    const worker = loadWorker(offline);
    worker.cached.set(worker.keyOf(asset('app.js')), {
      response: new Response('cached'),
    });

    const response = await dispatchFetch(worker.listeners, asset('app.js'));

    expect(await response.text()).toBe('cached');
  });

  it('fails like the network when offline and nothing is cached', async () => {
    const worker = loadWorker(offline);

    await expect(dispatchFetch(worker.listeners, asset('app.js'))).rejects.toThrow(
      'Failed to fetch',
    );
  });

  it('passes an error response through without caching it', async () => {
    const worker = loadWorker(async () => new Response('missing', { status: 404 }));

    const response = await dispatchFetch(worker.listeners, asset('ui/gone.js'));

    expect(response.status).toBe(404);
    expect(worker.cached.size).toBe(0);
  });

  it('falls back to the cached shell for a navigation while offline', async () => {
    const worker = loadWorker(offline);
    worker.cached.set(worker.keyOf('index.html'), {
      response: new Response('shell'),
    });

    const response = await dispatchFetch(worker.listeners, {
      method: 'GET',
      mode: 'navigate',
      url: `${SCOPE}?tour=1`,
    });

    expect(await response.text()).toBe('shell');
  });

  it.each([
    ['a map tile from another origin', 'https://tile.openstreetmap.org/1/0/0.png', 'GET'],
    ['an API call', 'https://nobuddy.org/api/tours', 'GET'],
    ['a write', `${SCOPE}app.js`, 'POST'],
  ])('leaves %s to the browser', async (_label, url, method) => {
    const worker = loadWorker(async () => new Response('network'));

    expect(await dispatchFetch(worker.listeners, new Request(url, { method }))).toBeUndefined();
  });

  it('precaches every file past the HTTP cache, which may still hold the last deploy', async () => {
    const worker = loadWorker(offline);
    let installed;
    worker.listeners.install({
      waitUntil: (promise) => {
        installed = promise;
      },
    });
    await installed;

    const requests = [...worker.cached.values()].map((entry) => entry.request);
    expect(requests).toHaveLength(PRECACHE_URLS.length);
    for (const request of requests) expect(request.cache).toBe('reload');
  });
});
