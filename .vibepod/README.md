# The VibePod sandbox

This project is developed inside [VibePod](https://vibepod.dev), which runs the
coding agent in a container. `overlay/` adds this project's tooling to that
container.

## Why anything is here at all

The pod is rebuilt from its base image every time it starts, and there is no
`sudo` inside it. So a tool installed by hand from inside the pod is gone at the
next start, and on a machine that has never run this project it was never there
to begin with.

`overlay/Dockerfile` is a `FROM`-less fragment VibePod appends to the agent's
base image, with `overlay/` as the build context. It is committed, so the
toolchain arrives with the checkout.

Binaries belong in the image; Claude's own configuration does not.
`CLAUDE_CONFIG_DIR` is `/claude`, a mount from the host, and the mount covers
whatever the image put there.

## What it installs

| tool       | from | needed for                                                   |
| ---------- | ---- | ------------------------------------------------------------ |
| `gh`       | aqua | reading and merging pull requests without leaving the pod    |
| `task`     | aqua | `task check`, `task web` — the entry point to everything     |
| `prek`     | aqua | the git hooks: biome, tests, whitespace, YAML                |
| `chromium` | apt  | checking the live tab title and taking screenshots           |

The rule: **aqua for binaries, apt only for system libraries.** aqua installs
one pinned, checksum-verified release binary per package, for the right
architecture. A browser is not one binary — it needs a couple of dozen shared
libraries only the Debian package can place. `fonts-liberation` is listed
explicitly because `--no-install-recommends` drops it, and Chromium without any
font crashes on first navigation.

## Driving the site in a real browser

Playwright is not in the image — it is an npm package, and this project keeps
Biome as its only dev dependency. Install it outside the repository and point
it at the browser already there:

```sh
task web &   # serves dist/ on :8080
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright
node -e "
  const { chromium } = require('playwright');
  chromium.launch({ executablePath: process.env.CHROME_PATH }).then(async b => {
    const p = await b.newPage();
    await p.goto('http://localhost:8080/');
    console.log(await p.title());
    await p.screenshot({ path: 'shot.png' });
    await b.close();
  });
"
```

## Changing it

Edit `overlay/aqua.yaml`, restart the pod. VibePod hashes the overlay directory,
so an edit rebuilds and an unchanged directory reuses the cached image.

```sh
uvx vibepod run claude --rebuild-overlay   # force a rebuild
uvx vibepod run claude --no-overlay        # start from the plain base image
```

Keep the task and prek versions in `aqua.yaml` and `mise.toml` in step
(`test/docs.test.mjs` fails otherwise; Renovate updates both in one PR). CI
builds this overlay on every pull request, so an update that breaks it never
merges.
