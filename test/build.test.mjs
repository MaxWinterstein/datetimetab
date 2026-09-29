/**
 * The build's reference scan (tools/build-web.mjs) is the only thing that
 * catches a deployed page whose modules 404. It is tested against fixtures
 * here, because a regex that stops matching fails *open*: the build stays
 * green and checks nothing.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findUnresolved } from '../tools/build-web.mjs';

const dirs = [];
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

async function fixture(files) {
  const dir = await mkdtemp(join(tmpdir(), 'tabclock-build-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, content);
  }
  return dir;
}

test('a clean site reports nothing', async () => {
  const dir = await fixture({
    'index.html':
      '<link rel="stylesheet" href="./style.css"><script type="module" src="./app.js"></script><a href="https://example.com">x</a><a href="#top">top</a>',
    'style.css':
      '.a { background: url(./img/bg.svg); } .b { background: url("data:image/svg+xml,x"); }',
    'img/bg.svg': '<svg/>',
    'app.js': [
      "import { a,\n  b,\n} from './lib.js';",
      "import './side.js';",
      "const lazy = () => import('./lazy.js');",
      "const w = new Worker('./worker.js');",
    ].join('\n'),
    'lib.js': 'export const a = 1; export const b = 2;',
    'side.js': '',
    'lazy.js': '',
    'worker.js': '',
  });
  const { missing, checked } = await findUnresolved(dir);
  assert.deepEqual(missing, []);
  assert.equal(checked, 7, 'expected 7 references: html 2, css 1, js 4');
});

test('every kind of broken reference is reported', async () => {
  const dir = await fixture({
    'index.html': '<script type="module" src="/app.js"></script><img src="./gone.png">',
    'app.js': [
      "import { a,\n  b,\n} from './multi.js';",
      "import './nope.js';",
      "const lazy = () => import('./lazy.js');",
      "import _ from 'lodash';",
      "const w = new Worker('./worker.js');",
    ].join('\n'),
    'style.css': '.a { background: url(missing.svg); } @import "./other.css";',
  });
  const { missing } = await findUnresolved(dir);
  const expect = [
    'index.html -> /app.js (root-absolute',
    'index.html -> ./gone.png',
    'app.js -> ./multi.js',
    'app.js -> ./nope.js',
    'app.js -> ./lazy.js',
    'app.js -> lodash (bare specifier',
    'app.js -> ./worker.js',
    'style.css -> missing.svg',
    'style.css -> ./other.css',
  ];
  for (const e of expect) {
    assert.ok(
      missing.some((m) => m.startsWith(e)),
      `not reported: ${e}\n  got: ${missing.join('\n       ')}`,
    );
  }
  assert.equal(missing.length, expect.length, missing.join('\n'));
});

test('the real build succeeds and writes .nojekyll', () => {
  const script = fileURLToPath(new URL('../tools/build-web.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(new URL('../dist/.nojekyll', import.meta.url)));
  assert.ok(existsSync(new URL('../dist/tick-worker.js', import.meta.url)));
});
