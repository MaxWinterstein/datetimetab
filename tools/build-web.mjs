#!/usr/bin/env node
/**
 * Assembles the static site into dist/.
 *
 * There is no bundler and there never needs to be one: web/ is plain ES
 * modules the browser imports directly. This script copies it and then proves
 * that everything it references actually exists.
 *
 * The reference scan is exported (findUnresolved) so test/build.test.mjs can
 * run it against fixtures: a regex that silently stops matching would leave
 * this safety net green while catching nothing.
 */
import { existsSync, statSync } from 'node:fs';
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
 * Why the scan exists at all: a module the page imports but that is missing
 * from dist/ leaves unit tests and lint green while the deployed page 404s
 * the import -- which kills every script on it. The page then renders
 * perfectly and does nothing at all; for a site whose whole point is a script
 * updating the tab title, that is the one failure worth catching at build time.
 */
const PATTERNS = {
  '.js': [
    // import x from './a.js'  |  import './a.js'  |  export { x } from './a.js'
    // [^'"]*? spans newlines, so multi-line `import {\n a,\n b\n} from` counts.
    /^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s)?\s*['"]([^'"]+)['"]/gm,
    // import('./a.js') with a literal specifier
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    // new Worker('./w.js') -- loaded by URL, invisible to the import patterns.
    /\bnew\s+(?:Shared)?Worker\(\s*['"]([^'"]+)['"]/g,
  ],
  '.html': [/\s(?:src|href)\s*=\s*["']([^"']+)["']/gi],
  '.css': [/url\(\s*['"]?([^'")]+?)['"]?\s*\)/gi, /@import\s+['"]([^'"]+)['"]/gi],
};
PATTERNS['.mjs'] = PATTERNS['.js'];

/** External, in-page, or otherwise not a file we could ship. */
function isLocal(ref) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref) && ref.trim() !== '';
}

/**
 * Every local reference under `dir` that would not work once published.
 * @param {string | URL} dir directory to scan
 * @returns {Promise<{missing: string[], checked: number, files: string[]}>}
 */
export async function findUnresolved(dir) {
  const path = dir instanceof URL ? fileURLToPath(dir) : String(dir);
  // Trailing slash, or new URL(file, rootUrl) would resolve beside the dir.
  const rootUrl = pathToFileURL(path.endsWith('/') ? path : `${path}/`);
  const files = (await readdir(rootUrl, { recursive: true })).filter(
    (f) => !statSync(new URL(f, rootUrl)).isDirectory(),
  );
  const missing = [];
  let checked = 0;

  for (const file of files) {
    const ext = file.slice(file.lastIndexOf('.'));
    const patterns = PATTERNS[ext];
    if (!patterns) continue;
    const base = new URL(file, rootUrl);
    const source = await readFile(base, 'utf8');
    const refs = new Set();
    for (const re of patterns) for (const [, ref] of source.matchAll(re)) refs.add(ref);
    for (const ref of refs) {
      if (!isLocal(ref)) continue;
      // Bare specifiers ('lodash') cannot work without a bundler or import map.
      if (ext !== '.html' && ext !== '.css' && !/^\.{0,2}\//.test(ref)) {
        missing.push(`${file} -> ${ref} (bare specifier, no bundler here)`);
        continue;
      }
      // Root-absolute paths break on GitHub Pages, where the site lives under
      // /<repo>/ rather than at the domain root.
      if (ref.startsWith('/')) {
        missing.push(`${file} -> ${ref} (root-absolute, breaks under /tabclock/ on Pages)`);
        continue;
      }
      checked++;
      const url = new URL(ref.split(/[?#]/)[0], base);
      let target = fileURLToPath(url);
      if (existsSync(target) && statSync(target).isDirectory()) target += '/index.html';
      if (!existsSync(target)) missing.push(`${file} -> ${ref}`);
    }
  }
  return { missing, checked, files };
}

async function build() {
  const root = new URL('../', import.meta.url);
  const web = new URL('web/', root);
  const dist = new URL('dist/', root);

  if (!existsSync(web)) {
    console.error('web/ does not exist -- nothing to build');
    process.exit(1);
  }

  await rm(dist, { recursive: true, force: true });
  // dereference: a symlink in web/ pointing outside the tree would otherwise
  // be copied as a link, and GitHub Pages would publish a dangling one.
  await cp(web, dist, { recursive: true, dereference: true });

  // Without this, GitHub Pages runs the output through Jekyll, which drops
  // files and directories whose names begin with an underscore.
  await writeFile(new URL('.nojekyll', dist), '');

  const { missing, checked, files } = await findUnresolved(dist);
  if (missing.length) {
    console.error('unresolved references in the built site:');
    for (const m of missing) console.error(`  ${m}`);
    process.exit(1);
  }

  console.log(`built ${fileURLToPath(dist)}`);
  for (const f of files.sort()) console.log(`  ${f}`);
  console.log(`  (${checked} local references, all resolve)`);
}

// Run only when executed, not when imported by the tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await build();
