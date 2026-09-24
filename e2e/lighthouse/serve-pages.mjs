// Serves frontend/src the way GitHub Pages serves it: under /BikeBuddy/, gzip,
// max-age=600. `node lighthouse/serve-pages.mjs <port> <signed-out|signed-in>`.
// config.js is generated in memory per state (the repo file is never touched):
// signed-out is production-shaped (MSAL configured, nobody signed in);
// signed-in is devMode against the local Functions host, proxied at /api like
// the SWA CLI does, so the app talks same-origin.
import { createServer, request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('../../frontend/src/', import.meta.url));
const BASE = '/BikeBuddy/';
const port = Number(process.argv[2] ?? 4173);
const state = process.argv[3] ?? 'signed-out';
const api = new URL(process.env.LIGHTHOUSE_API_URL ?? 'http://127.0.0.1:7071');

const CONFIGS = {
  'signed-out': {
    apiBaseUrl: '',
    entraSubdomain: 'example',
    entraClientId: '00000000-0000-0000-0000-000000000000',
    entraApiScope: 'api://00000000-0000-0000-0000-000000000000/access_as_user',
    devMode: false,
  },
  'signed-in': {
    apiBaseUrl: '',
    entraSubdomain: '',
    entraClientId: '',
    entraApiScope: '',
    devMode: true,
  },
};
if (!CONFIGS[state]) throw new Error(`unknown state "${state}" (signed-out | signed-in)`);
const CONFIG_JS = `'use strict';\nwindow.BIKEBUDDY_CONFIG = ${JSON.stringify(CONFIGS[state])};\n`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json)|image\/svg)/;

function send(req, res, status, type, body) {
  const headers = { 'content-type': type, 'cache-control': 'max-age=600' };
  if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    body = gzipSync(body);
    headers['content-encoding'] = 'gzip';
  }
  res.writeHead(status, headers);
  res.end(body);
}

function proxyApi(req, res) {
  const upstream = request(
    { host: api.hostname, port: api.port, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path.startsWith('/api/')) return proxyApi(req, res);
  // Only the site root redirects; anything else outside the base path (e.g.
  // /robots.txt, which belongs to the nobuddy.org site) is not ours to serve.
  if (path === '/') {
    res.writeHead(302, { location: BASE });
    return res.end();
  }
  if (!path.startsWith(BASE)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }
  const rel = normalize(path.slice(BASE.length) || 'index.html').replace(/^(\.\.[/\\])+/, '');
  if (rel === 'config.js') return send(req, res, 200, TYPES['.js'], Buffer.from(CONFIG_JS));
  try {
    const body = await readFile(join(ROOT, rel));
    send(req, res, 200, TYPES[extname(rel)] ?? 'application/octet-stream', body);
  } catch {
    send(req, res, 404, TYPES['.html'], await readFile(join(ROOT, '404.html')));
  }
}).listen(port, '127.0.0.1', () => {
  // lhci's startServerReadyPattern waits for this line.
  console.log(`Accepting connections at http://127.0.0.1:${port}${BASE} (${state})`);
});
