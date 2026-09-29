# AGENTS.md

Notes for anyone — human or agent — working in this repository.

## What this is

`datetime-tab` is a static web page whose job is to keep the current date and time
in the browser tab title (`document.title`), in a user-chosen format. Everything
else — the preview, the settings UI — exists to serve that.

## Ground rules

- **No framework, no bundler, no runtime dependencies.** `web/` is served
  as-is; files are plain ES modules loaded with `<script type="module">`.
  Relative imports must include the `.js` extension, because the browser
  resolves them literally.
- **Biome is the only dev dependency**, pinned to an exact version. Do not add
  others. If you need a tool once, install it outside the repo (see
  `.vibepod/README.md` for Playwright).
- **Node 22+**, pinned exactly in `mise.toml`, which CI installs from too. Tests use `node:test` and `node:assert/strict`.
- **Relative paths only** in `web/`. The site is published under
  `/datetimetab/` on GitHub Pages, so `/app.js` would 404 there. `task build`
  rejects root-absolute references.
- **Comments explain why**, not what. If a decision was not obvious, write
  down the reason next to it.

## Layout

| path                  | what                                                         |
| --------------------- | ------------------------------------------------------------ |
| `web/`                | the site; the static root                                    |
| `web/format.js`       | pure formatting logic — **no DOM access**, so tests import it |
| `web/sw.js`           | service worker (offline, install); `ASSETS` lists every file  |
| `test/*.test.mjs`     | tests, run with `node --test "test/*.test.mjs"`              |
| `tools/build-web.mjs` | copies `web/` to `dist/`, verifies every local reference     |
| `tools/serve.mjs`     | zero-dependency static server on :8080 (`web/` or `dist/`)   |
| `.github/workflows/`  | `ci.yml` (checks), `pages.yml` (deploy after CI on main)     |
| `.vibepod/`           | container overlay providing `task`, `prek`, `gh`, chromium   |

## Before you say you are done

```sh
task check
```

That runs lint, tests, the site build and every prek hook — the same things CI
runs. Use `task fmt` to fix formatting rather than hand-editing whitespace.

Keep logic in `web/format.js` (or another DOM-free module) and cover it with a
test; keep `web/app.js` a thin layer of DOM wiring. Anything time-dependent in
tests should take an explicit `Date` rather than reading the clock.

## Keeping things in step

These are duplicated on purpose and must move together. `test/docs.test.mjs`
fails when the Biome, task/prek, token and URL-parameter pairs drift apart.
Renovate groups each pair into one PR (see `renovate.json`); a hand edit has
to do the same:

- **Biome version**: `package.json` and the `$schema` URL in `biome.jsonc`.
- **task and prek**: `mise.toml` and `.vibepod/overlay/aqua.yaml`.
- **Actions**: pinned to commit SHAs with the tag in a comment.
- **CI job names** (`check`, `overlay`) are required status checks on `main`;
  renaming one means updating branch protection, or automerge waits forever.
- **Service worker asset list**: a new file in `web/` must be added to
  `ASSETS` in `web/sw.js`; `test/pwa.test.mjs` fails until it is.
- **Test command**: `package.json`, `Taskfile.yml`, `.pre-commit-config.yaml`
  and `ci.yml` all run `node --test "test/*.test.mjs"`.
- **URL parameters and tokens**: `parseSettings()` / `TOKENS` in
  `web/format.js` and the tables in `README.md`.

## Git

- Work on a branch, open a PR; `main` deploys automatically once CI passes.
- Never `git commit --no-verify`. If a hook fails because Biome is missing,
  run `task setup`.
