// Static server for ../frontend/src; config.js comes from memory, so a local one never applies.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..', 'frontend', 'src');
const port = Number(process.env.E2E_PORT) || 4281;

const CONFIG_JS = `'use strict';\nwindow.BIKEBUDDY_CONFIG = ${JSON.stringify({
  apiBaseUrl: '',
  entraSubdomain: '',
  entraClientId: '',
  entraApiScope: '',
  devMode: true,
})};\n`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  // Prevent path traversal, default to index.html.
  const rel = normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
  if (rel === '/config.js') {
    res.writeHead(200, { 'content-type': TYPES['.js'] });
    return res.end(CONFIG_JS);
  }
  try {
    const data = await readFile(join(root, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}).listen(port, () => console.log(`e2e static server: ${root} on http://localhost:${port}`));
