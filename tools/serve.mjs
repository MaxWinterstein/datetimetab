#!/usr/bin/env node

// Minimal static file server. Exists so that previewing the site needs no
// dependency -- opening index.html over file:// fails, because ES module
// imports are blocked by the same-origin policy there.
//
//   node tools/serve.mjs          serves web/ (edit, reload, done)
//   node tools/serve.mjs dist     serves the build, exactly what Pages gets

import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const dir = process.argv[2] ?? 'web';
let ROOT;
try {
  // realpath up front, so the containment check below compares like with like
  // even when the checkout itself sits behind a symlink.
  ROOT = await realpath(resolve(repo, dir));
} catch {
  console.error(`nothing to serve: ${resolve(repo, dir)} does not exist`);
  if (dir === 'dist') console.error('run `task build` first');
  process.exit(2);
}

// PORT=0 asks the OS for a free port (the tests use it); the real one is
// printed below.
const PORT = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65_535) {
  console.error(`PORT must be a number between 0 and 65535, got "${process.env.PORT}"`);
  process.exit(2);
}

// Loopback only. Omitting the host binds 0.0.0.0, which puts the site on the
// whole network. Set HOST=0.0.0.0 deliberately to test from a phone.
const HOST = process.env.HOST ?? '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
    res.end('method not allowed\n');
    return;
  }
  try {
    // Strip the query string and refuse anything trying to climb out of ROOT.
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let path = join(ROOT, rel);
    if (path !== ROOT && !path.startsWith(ROOT + sep)) throw new Error('outside root');

    const info = await stat(path).catch(() => null);
    if (info?.isDirectory()) path = join(path, 'index.html');

    // Resolve symlinks before serving. The lexical check above is sound
    // against `../`, but says nothing about a link inside the root pointing
    // out of it.
    const real = await realpath(path);
    if (real !== ROOT && !real.startsWith(ROOT + sep)) throw new Error('outside root');

    const body = await readFile(real);
    res.writeHead(200, {
      'content-type': TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream',
      // A dev server: never let the browser hold on to a stale module.
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
  }
});
// Without this, a busy port ends in a raw EADDRINUSE stack trace.
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `port ${PORT} on ${HOST} is already in use -- stop the other server or set PORT=...`
      : `could not start the server: ${error.message}`,
  );
  process.exit(2);
});
server.listen(PORT, HOST, () => {
  console.log(`serving ${ROOT}`);
  console.log(`  http://localhost:${server.address().port}`);
});
