# VibePod overlay: a FROM-less fragment appended to whichever agent image
# VibePod runs for this project. https://vibepod.dev/docs/overlays/
#
# Why it exists: the pod is rebuilt from the base image on every start and the
# container has no sudo, so a tool installed by hand from inside it is gone at
# the next start -- and was never there at all on a machine that has not run
# this project before. Everything Taskfile.yml and AGENTS.md tell you to run is
# pinned here instead, and comes back with the pod.
#
# The build context is this directory, which is why aqua.yaml can be COPYed.
# VibePod hashes the whole directory, so editing either file rebuilds the image
# and leaving them alone reuses it.

COPY aqua.yaml /tmp/overlay/aqua.yaml

RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    aqua_version=2.63.0; \
    base="https://github.com/aquaproj/aqua/releases/download/v${aqua_version}"; \
    mkdir -p /tmp/aqua-bin; \
    cd /tmp/aqua-bin; \
    # Downloaded under their published names, because the checksum file lists
    # them that way and -c matches on the name.
    curl -fsSL -O "${base}/aqua_linux_${arch}.tar.gz"; \
    curl -fsSL -O "${base}/aqua_${aqua_version}_checksums.txt"; \
    # aqua verifies everything it installs; nothing verifies aqua itself.
    # --ignore-missing so the one platform's tarball is checked rather than
    # every asset of the release that was never downloaded.
    sha256sum --ignore-missing -c "aqua_${aqua_version}_checksums.txt"; \
    tar -xzf "aqua_linux_${arch}.tar.gz" aqua; \
    # `cp` writes the real executables. `aqua install` would write lazy shims
    # that fetch on first use -- at runtime, for a tool the image is supposed
    # to already have. After this, aqua itself is build-time only.
    AQUA_ROOT_DIR=/tmp/aqua-root AQUA_GLOBAL_CONFIG=/tmp/overlay/aqua.yaml \
      ./aqua cp -o /usr/local/bin gh task prek; \
    # Same layer, or the aqua cache unpacked to get here stays in the image.
    rm -rf /tmp/aqua-bin /tmp/aqua-root /tmp/overlay; \
    gh --version; task --version; prek --version

# Chromium, for looking at the tab title in a real browser under Playwright.
#
# From apt, not aqua: aqua installs one release binary per package, and a
# browser is not one binary -- it needs around twenty system shared libraries
# (libglib, libnss3, libasound, libgbm) that only the distro package pulls in.
#
# fonts-liberation is named explicitly because it is only a *Recommends* of
# chromium-common, and --no-install-recommends drops it. A Chromium with no
# font at all does not degrade to ugly text: Skia aborts and the browser dies
# on the first navigation. The emoji font keeps screenshots free of tofu boxes.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-dejavu-core fonts-noto-color-emoji; \
    rm -rf /var/lib/apt/lists/*; \
    chromium --version

ENV CHROME_PATH=/usr/bin/chromium
