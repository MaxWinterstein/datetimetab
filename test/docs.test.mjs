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

test('CI and the vibepod overlay install the same prek', async () => {
  const ci = (await read('.github/workflows/ci.yml')).match(/PREK_VERSION: (v[\d.]+)/)?.[1];
  const aqua = (await read('.vibepod/overlay/aqua.yaml')).match(/j178\/prek@(v[\d.]+)/)?.[1];
  assert.ok(ci && aqua, 'could not find the prek version in ci.yml or aqua.yaml');
  assert.equal(ci, aqua);
});

test('mise.toml pins the same Node, task and prek as .nvmrc, CI and the overlay', async () => {
  const [mise, nvmrc, ci, aqua] = await Promise.all([
    read('mise.toml'),
    read('.nvmrc'),
    read('.github/workflows/ci.yml'),
    read('.vibepod/overlay/aqua.yaml'),
  ]);
  assert.equal(mise.match(/^node = "([^"]+)"/m)?.[1], nvmrc.trim());
  assert.equal(
    `v${mise.match(/"aqua:j178\/prek" = "([^"]+)"/)?.[1]}`,
    ci.match(/PREK_VERSION: (v[\d.]+)/)?.[1],
  );
  assert.equal(
    mise.match(/"aqua:go-task\/task" = "([^"]+)"/)?.[1],
    aqua.match(/go-task\/task@v([\d.]+)/)?.[1],
  );
});
