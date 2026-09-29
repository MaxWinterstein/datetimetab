/**
 * An alarm clock for app.js, nothing more: sleeps for the delay it is sent,
 * then posts back.
 *
 * Why a worker at all: Chrome's intensive throttling batches chained
 * setTimeout calls on a page hidden for five minutes to once a minute, so a
 * title with seconds would sit stale in the very background tab it exists
 * for. Dedicated-worker timers are not subject to that throttling. The
 * rendering stays on the main thread -- only the wake-up moves here.
 *
 * A classic (non-module) worker on purpose: it needs no imports, and classic
 * workers run on every engine that runs the page.
 */
let timer = 0;

self.onmessage = (event) => {
  clearTimeout(timer);
  timer = setTimeout(() => self.postMessage(0), event.data);
};
