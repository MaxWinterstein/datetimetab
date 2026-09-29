/**
 * Things duplicated on purpose (see AGENTS.md, "Keeping things in step") are
 * held together here, so drift fails a test instead of waiting for a reader
 * to notice.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PRESETS, SETTING_KEYS, TOKENS } from '../web/format.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/** Rows of the first Markdown table after `heading`, as arrays of cells. */
function tableAfter(markdown, heading) {
  const start = markdown.indexOf(heading);
  assert.ok(start >= 0, `README has no "${heading}" section`);
  const lines = markdown.slice(start).split('\n');
  const first = lines.findIndex((l) => l.startsWith('|'));
  const rows = [];
  for (const line of lines.slice(first)) {
    if (!line.startsWith('|')) break;
    rows.push(
      line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  }
  // Drop the header and the |---| separator.
  return rows.slice(2);
}

const codes = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

test('README token table lists exactly the tokens format.js knows', async () => {
  const rows = tableAfter(await read('README.md'), '### Format tokens');
  // Two token/example column pairs side by side: tokens are columns 0 and 2.
  const documented = rows.flatMap((r) => [...codes(r[0]), ...codes(r[2])]);
  const known = TOKENS.map((t) => t.token).filter((t) => t !== '[text]');
  assert.deepEqual([...documented].sort(), [...known].sort());
});

test('README URL parameter table matches the setting keys and presets', async () => {
  const rows = tableAfter(await read('README.md'), '## URL parameters');
  const keys = rows.map((r) => codes(r[0])[0]);
  assert.deepEqual([...keys].sort(), [...SETTING_KEYS].sort());
  const presetRow = rows.find((r) => codes(r[0])[0] === 'preset');
  const ids = [...PRESETS.map((p) => p.id), 'custom'];
  assert.deepEqual(codes(presetRow[1]).sort(), ids.sort());
});

test('biome.jsonc $schema matches the pinned Biome version', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const version = pkg.devDependencies['@biomejs/biome'];
  assert.match(version, /^\d+\.\d+\.\d+$/, 'Biome must be pinned to an exact version');
  assert.ok(
    (await read('biome.jsonc')).includes(`/schemas/${version}/schema.json`),
    `biome.jsonc $schema does not point at ${version}`,
  );
});

test('mise.toml and the vibepod overlay pin the same task and prek', async () => {
  // CI installs from mise.toml; the overlay has its own aqua.yaml. Renovate
  // groups the two, and this catches a hand edit that touches only one.
  const [mise, aqua] = await Promise.all([read('mise.toml'), read('.vibepod/overlay/aqua.yaml')]);
  for (const tool of ['go-task/task', 'j178/prek']) {
    const pinned = mise.match(new RegExp(`"aqua:${tool}" = "([^"]+)"`))?.[1];
    const overlay = aqua.match(new RegExp(`${tool}@v([\\d.]+)`))?.[1];
    assert.ok(pinned && overlay, `${tool} not found in mise.toml or aqua.yaml`);
    assert.equal(pinned, overlay, tool);
  }
});

test('Node is pinned exactly, once', async () => {
  // A range would let CI change Node without a pull request.
  assert.match(await read('mise.toml'), /^node = "\d+\.\d+\.\d+"$/m);
});

test('every third-party action is pinned to a full commit SHA', async () => {
  // A tag can be moved to other code after review; a SHA cannot.
  const { readdir } = await import('node:fs/promises');
  const dir = new URL('../.github/workflows/', import.meta.url);
  for (const file of await readdir(dir)) {
    const text = await readFile(new URL(file, dir), 'utf8');
    for (const [, ref] of text.matchAll(/uses:\s*(\S+)/g)) {
      assert.match(ref, /@[0-9a-f]{40}$/, `${file}: ${ref}`);
    }
  }
});
