import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const web = new URL('../web/', import.meta.url);
const read = (f) => readFile(new URL(f, web), 'utf8');

test('the service worker caches every file in web/', async () => {
  // A module missing from ASSETS works online and breaks the page offline --
  // exactly the kind of failure nobody notices until it matters.
  const sw = await read('sw.js');
  const list = sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1];
  const assets = [...list.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  const files = (await readdir(web)).filter((f) => f !== 'sw.js');
  assert.deepEqual([...assets].sort(), [...files].sort());
  assert.ok(list.includes("'./'"), 'the bare directory URL is what a bookmark opens');
});

test('the manifest is valid and its icons exist', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.length > 0);
  const files = await readdir(web);
  for (const icon of manifest.icons)
    assert.ok(files.includes(icon.src.replace('./', '')), icon.src);
});

test('the page links the manifest and its CSP allows it', async () => {
  const html = await read('index.html');
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"/);
  // default-src 'none' blocks the manifest unless manifest-src says otherwise.
  assert.match(html, /manifest-src 'self'/);
});

test('the app registers the service worker by a relative URL', async () => {
  // Pages serves the site under /datetime-tab/, so '/sw.js' would 404.
  assert.match(await read('app.js'), /serviceWorker\.register\('\.\/sw\.js'\)/);
});
