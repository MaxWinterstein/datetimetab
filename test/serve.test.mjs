/**
 * tools/serve.mjs, end to end. The containment check is the part worth
 * testing: HOST=0.0.0.0 is documented, and encoded traversal ("%2e%2e",
 * "..%2f") is exactly what a harmless-looking refactor lets through.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SERVE = fileURLToPath(new URL('../tools/serve.mjs', import.meta.url));
let child;
let origin;

before(async () => {
  child = spawn(process.execPath, [SERVE, 'web'], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let out = '';
  child.stdout.setEncoding('utf8');
  while (!/localhost:(\d+)/.test(out)) {
    const [chunk] = await once(child.stdout, 'data');
    out += chunk;
  }
  origin = `http://127.0.0.1:${out.match(/localhost:(\d+)/)[1]}`;
});

after(() => child?.kill());

// fetch() would normalise "/../" away before sending; a raw path does not.
async function get(path) {
  const { request } = await import('node:http');
  return new Promise((resolve, reject) => {
    const req = request(`${origin}${path}`, { path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () =>
        resolve({ status: res.statusCode, type: res.headers['content-type'], body }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves index.html for / and modules as JavaScript', async () => {
  const index = await get('/');
  assert.equal(index.status, 200);
  assert.match(index.type, /^text\/html/);
  assert.match(index.body, /<title>datetime-tab<\/title>/);
  const app = await get('/app.js?v=1');
  assert.equal(app.status, 200);
  assert.match(app.type, /^text\/javascript/);
});

test('refuses to leave the served directory', async () => {
  for (const path of [
    '/../package.json',
    '/%2e%2e/package.json',
    '/..%2fpackage.json',
    '/%2e%2e%2fpackage.json',
    '/..%5cpackage.json',
    '/web/../../package.json',
  ]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(res.body, /"devDependencies"/, path);
  }
});

test('unknown files are a 404', async () => {
  assert.equal((await get('/nope.js')).status, 404);
});
