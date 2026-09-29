# datetime-tab

Today's **date** and time in your browser **tab title**, live, in whatever
format you like. Most tab clocks only show the time; datetime-tab puts the
weekday, date and even the ISO week number up there too. Pin the tab and
you never have to wonder what day it is.

### → [maxwinterstein.github.io/datetime-tab](https://maxwinterstein.github.io/datetime-tab/)

A single static page: no framework, no build step, no tracking, no cookies.
Your settings stay in your browser.

## Features

- **Live tab title** — `document.title` updates on each second boundary (or
  each minute, if your format has no seconds), so it does not drift.
- **Presets or your own format** — weekday clock, time only, ISO 8601, locale
  default, date only, week number, Unix timestamp; or write a pattern with
  tokens (`HH:mm:ss`, `ddd D MMM`, …). The page shows a large live preview and
  a mock tab strip, so you can see where a long title gets cut off.
- **Language, time zone, 12/24 h, seconds, prefix/suffix** — all adjustable.
- **A clock-face favicon** that shows the current time, refreshed every minute.
- **Remembers your choice** in `localStorage` and can be **shared as a link**
  (*Copy link*); *Reset* returns to the defaults.
- **Keeps running without a network** once open — nothing is fetched after
  the first load. (There is no service worker, so a *reload* needs the
  network.)

### Format tokens

| token                 | example                    | token               | example           |
| --------------------- | -------------------------- | ------------------- | ----------------- |
| `YYYY` `YY`           | `2026` `26`                | `HH` `H`            | `09` `9` (24 h)   |
| `MMMM` `MMM` `MM` `M` | `September` `Sep` `09` `9` | `hh` `h`            | `09` `9` (12 h)   |
| `DD` `D`              | `05` `5`                   | `mm` `ss`           | minutes, seconds  |
| `dddd` `ddd`          | `Tuesday` `Tue`            | `A` `a`             | `PM` `pm`         |
| `W` `WW` `GGGG`       | ISO week, week-year        | `Z` `ZZ` `z`        | offset, zone name |
| `X`                   | Unix seconds               | `L` `LL` `LT` `LTS` | locale formats    |

Anything else in `[brackets]` is printed literally. **Wrap plain words in
brackets**, e.g. `HH:mm [Uhr]` — otherwise letters like `h` or `a` are read as
tokens. The page lists every token with a live example.

## URL parameters

<!-- Keep in sync with parseSettings() in web/format.js. -->

| parameter | values                                                      | example               |
| --------- | ----------------------------------------------------------- | --------------------- |
| `preset`  | `clock` `time` `iso` `locale` `date` `week` `unix` `custom` | `?preset=iso`         |
| `format`  | a token pattern (implies `preset=custom` if no `preset`)    | `?format=HH:mm+[Uhr]` |
| `locale`  | a BCP 47 language tag; empty = browser default              | `?locale=de-DE`       |
| `tz`      | an IANA time zone; empty = your own                         | `?tz=Asia/Tokyo`      |
| `clock`   | `auto` `12` `24`                                            | `?clock=24`           |
| `seconds` | `1` or `0`                                                  | `?seconds=0`          |
| `prefix`  | text before the time (up to 24 chars)                       | `?prefix=Berlin`      |
| `suffix`  | text after the time (up to 24 chars)                        | `?suffix=(UTC)`       |

Invalid values are ignored. If the URL carries any of these, it wins
*entirely* over your saved settings, so a shared link shows the same clock for
everyone who opens it. A bare URL uses what you saved last time. Opening a
link does not overwrite your saved settings; only changing something on the
page does.

## Background tabs

Browsers throttle timers in background tabs — Chrome batches them to once a
minute after five minutes hidden. datetime-tab therefore keeps its wake-up timer in
a small Web Worker (`web/tick-worker.js`), whose timers are not subject to that
throttling, and falls back to a normal timer where workers are unavailable. If
a browser still delays it, the page catches up as soon as the tab is visible
or focused again. Formats without seconds are unaffected in practice.

## Quick start

You need [Node 22+](https://nodejs.org), [go-task](https://taskfile.dev) and
[prek](https://github.com/j178/prek) (git hooks; `task check` runs them too,
and CI does). Without prek, `task setup` and `task check` warn and skip the
hooks.

```sh
task setup    # npm install + git hooks
task serve    # http://localhost:8080 straight from web/ — edit, reload
```

### Remember these

| command          | what it does                                             |
| ---------------- | -------------------------------------------------------- |
| `task`           | list every task                                          |
| `task setup`     | install Biome and the git hooks (once per clone)         |
| `task serve`     | serve `web/` at <http://localhost:8080>                  |
| `task test`      | run the tests (`task test:watch` to keep them running)   |
| `task fmt`       | format everything and apply safe lint fixes              |
| `task check`     | **everything CI runs** — do this before you push         |
| `task web`       | build `dist/` and serve exactly what Pages will publish  |

If `task check` is green *with prek installed*, CI will be green. Without prek
the whitespace/YAML/JSON hooks are skipped locally but still run in CI.

## Development

```
web/          the site, served as-is — index.html, style.css, ES modules
  format.js   pure formatting logic, no DOM, imported by the tests
test/         node:test suites (*.test.mjs)
tools/        build-web.mjs (copy + link check), serve.mjs (zero-dep server)
```

- **No bundler, no framework.** The browser loads `web/` directly as ES
  modules. The only dev dependency is [Biome](https://biomejs.dev), for lint
  and formatting.
- **Tests** use Node's built-in runner: `node --test "test/*.test.mjs"`.
  Formatting logic lives in `web/format.js` precisely so it can be tested
  without a browser.
- **`task build`** copies `web/` to `dist/` and fails if any relative import,
  `src`, `href` or CSS `url()` points at a file that does not exist — a missing
  module would otherwise leave every check green and the deployed page dead.
- **Hooks** (prek, pre-commit compatible) run Biome and the tests on commit,
  plus whitespace/YAML/JSON hygiene. See `.pre-commit-config.yaml`.

See [AGENTS.md](AGENTS.md) for conventions.

## Deployment

Every push to `main` runs CI (lint, tests, build, hooks). When CI succeeds, the
**Deploy to GitHub Pages** workflow builds `dist/` from that exact commit and
publishes it. A red CI never deploys.

One-time setup on GitHub: **Settings → Pages → Build and deployment → Source:
GitHub Actions.** Without it the deploy job fails with a 404 from the Pages API.

You can also trigger a deploy by hand from the Actions tab (*Deploy to GitHub
Pages → Run workflow*).

## Licence

MIT — see [LICENSE](LICENSE).
