/**
 * Browser front end: keeps document.title ticking and wires up the settings
 * form. All formatting logic lives in format.js so it can be tested without
 * a DOM; this file only reads inputs, writes outputs and schedules ticks.
 */
import { dateFaviconUrl } from './favicon.js';
import {
  CUSTOM,
  canonicalLocale,
  controlsInEffect,
  DEFAULTS,
  formatDate,
  formatOptions,
  formatTitle,
  isValidTimeZone,
  msUntilNextTick,
  PRESETS,
  parseSettings,
  resolvePattern,
  resolveSettings,
  TOKENS,
  tickInterval,
  toQueryString,
  unbracketedWords,
  wallClock,
} from './format.js';

const STORAGE_KEY = 'datetime-tab:settings';

/* What the tab shows if a format renders to nothing ("[]", only spaces). An
   empty document.title makes the browser show the URL instead. */
const FALLBACK_TITLE = 'datetime-tab';

/*
 * Chromium and Firefox show roughly this many characters of a title in a
 * tab of default width. Only a hint -- tabs shrink as more are opened.
 */
const TYPICAL_TAB_CHARS = 26;

const COMMON_LOCALES = [
  'en-US',
  'en-GB',
  'de-DE',
  'de-CH',
  'fr-FR',
  'es-ES',
  'it-IT',
  'nl-NL',
  'sv-SE',
  'pl-PL',
  'pt-BR',
  'tr-TR',
  'ru-RU',
  'ja-JP',
  'ko-KR',
  'zh-CN',
  'hi-IN',
];

const el = (id) => document.getElementById(id);
const form = el('form');
const clockEl = el('clock');
const mockTab = el('mock-tab');
const mockTitle = el('mock-title');
const mockIcon = el('mock-icon');
const faviconLink = el('favicon');
const charCount = el('char-count');
const truncHint = el('trunc-hint');
const presetList = el('preset-list');
const tokenRows = el('token-rows');
const status = el('status');
const formatNote = el('format-note');
const clockFieldset = el('clock-fieldset');
const clockHelp = el('clock-help');
const secondsHelp = el('seconds-help');

/* ------------------------------------------------------------------------ */
/* Persistence                                                               */
/* ------------------------------------------------------------------------ */

/*
 * localStorage throws outright in some privacy modes and sandboxed iframes.
 * The app must keep working without it -- the URL still carries everything.
 */
function loadStored() {
  try {
    return new URLSearchParams(localStorage.getItem(STORAGE_KEY) ?? '');
  } catch {
    return new URLSearchParams();
  }
}

/*
 * Only ever called for something the user did (a form change, Reset). Boot
 * must not save: opening someone's shared link would otherwise overwrite the
 * recipient's own settings, and their bare bookmark would show the sender's
 * clock from then on.
 */
function saveStored(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, toQueryString(settings));
  } catch {
    // Storage unavailable; the URL still carries everything.
  }
}

function updateUrl(settings) {
  const query = toQueryString(settings);
  // replaceState, not pushState: every keystroke in the format field would
  // otherwise become a Back-button step.
  const url = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
  history.replaceState(null, '', url);
}

let settings = resolveSettings(new URLSearchParams(location.search), loadStored());

/* ------------------------------------------------------------------------ */
/* Form <-> settings                                                         */
/* ------------------------------------------------------------------------ */

function buildPresetList() {
  const options = [...PRESETS, { id: CUSTOM, label: 'Custom' }];
  for (const preset of options) {
    const label = document.createElement('label');
    label.className = 'preset';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'preset';
    input.value = preset.id;
    const name = document.createElement('span');
    name.className = 'preset-name';
    name.id = `preset-name-${preset.id}`;
    name.textContent = preset.label;
    const sample = document.createElement('span');
    sample.className = 'preset-sample';
    sample.id = `preset-sample-${preset.id}`;
    sample.dataset.preset = preset.id;
    // Name only, sample as description: the sample changes every second, and
    // as part of the name it would make each option long and some screen
    // readers re-announce the focused radio on every tick.
    input.setAttribute('aria-labelledby', name.id);
    input.setAttribute('aria-describedby', sample.id);
    label.append(input, name, sample);
    presetList.append(label);
  }
}

function buildDatalists() {
  const locales = el('locale-list');
  for (const tag of COMMON_LOCALES) {
    const option = document.createElement('option');
    option.value = tag;
    try {
      option.label = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
    } catch {
      // DisplayNames missing on very old engines; the bare tag is fine.
    }
    locales.append(option);
  }
  // supportedValuesOf is recent (2022); without it the field still accepts
  // any zone typed by hand, it just cannot suggest.
  const zones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const tzList = el('tz-list');
  for (const zone of ['UTC', ...zones]) {
    const option = document.createElement('option');
    option.value = zone;
    tzList.append(option);
  }
}

function writeForm() {
  form.elements.preset.value = settings.preset;
  form.elements.clock.value = settings.clock;
  form.elements.seconds.checked = settings.seconds;
  for (const key of ['locale', 'tz', 'prefix', 'suffix']) form.elements[key].value = settings[key];
  showPattern();
  markInvalid('locale', false);
  markInvalid('tz', false);
  syncControls();
}

/*
 * The format field always shows the pattern in effect -- a preset's too -- so
 * it is a starting point for tweaking rather than a stale default. The user's
 * own pattern lives on in settings.format and comes back with Custom.
 */
function showPattern() {
  form.elements.format.value = resolvePattern(settings);
}

/** Disable the toggles that would visibly do nothing for this format. */
function syncControls() {
  const active = controlsInEffect(settings);
  form.elements.seconds.disabled = !active.seconds;
  clockFieldset.disabled = !active.clock;
  clockHelp.hidden = active.clock;
  if (active.seconds) secondsHelp.textContent = 'Adds seconds to the preset.';
  else if (settings.preset === CUSTOM)
    secondsHelp.textContent = 'A custom format sets seconds itself, with ss.';
  else secondsHelp.textContent = 'Not used by this preset.';
}

/** Explains a format that silently does something other than expected. */
function updateFormatNote(title) {
  let note = '';
  if (settings.preset === CUSTOM) {
    const words = unbracketedWords(form.elements.format.value);
    if (form.elements.format.value.trim() === '') {
      note = 'Empty — showing the default format.';
    } else if (title === '') {
      note = `This format prints nothing, so the tab shows “${FALLBACK_TITLE}”.`;
    } else if (words.length) {
      note = `Letters in ${words.map((w) => `“${w}”`).join(', ')} are read as tokens. Wrap plain words in brackets: [${words[0]}].`;
    }
  }
  if (formatNote.textContent !== note) formatNote.textContent = note;
  formatNote.hidden = note === '';
}

function markInvalid(name, invalid) {
  const input = form.elements[name];
  // aria-invalid="" would read as false; it needs the literal "true".
  if (invalid) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  el(`${name}-error`).hidden = !invalid;
}

/**
 * Reads the form back into settings. Every value goes through the same
 * parseSettings() that guards the URL, so the form cannot produce a state a
 * link could not. A half-typed locale or zone keeps the previous value and is
 * flagged, rather than blanking the title mid-typing.
 */
function readForm(changed) {
  const f = form.elements;
  if (changed === f.format) f.preset.value = CUSTOM;
  const custom = f.preset.value === CUSTOM;
  const presetPicked = changed?.name === 'preset';

  const localeText = f.locale.value.trim();
  const tzText = f.tz.value.trim();
  const localeOk = localeText === '' || canonicalLocale(localeText) !== null;
  const tzOk = tzText === '' || isValidTimeZone(tzText);
  // Only complain once the text cannot become a suggestion: "Europe/Be" is
  // on its way to a valid zone and flagging it on every keystroke is noise.
  markInvalid('locale', !localeOk && !isPrefixOfOption('locale-list', localeText));
  markInvalid('tz', !tzOk && !isPrefixOfOption('tz-list', tzText));

  const parsed = parseSettings(
    new URLSearchParams({
      preset: f.preset.value,
      // With a preset selected the field merely displays that preset's
      // pattern; the user's own format is kept for when Custom comes back.
      // Picking Custom brings that format back rather than adopting whatever
      // preset pattern the field was displaying.
      format: custom && !presetPicked ? f.format.value : settings.format,
      clock: f.clock.value,
      seconds: f.seconds.checked ? '1' : '0',
      prefix: f.prefix.value,
      suffix: f.suffix.value,
    }),
  );
  settings = {
    ...DEFAULTS,
    ...parsed,
    locale: localeOk ? (canonicalLocale(localeText) ?? '') : settings.locale,
    tz: tzOk ? tzText : settings.tz,
  };
  // Follow the preset (and its seconds / 12 h variant); never overwrite a
  // custom pattern the user is in the middle of editing.
  if (!custom || presetPicked) showPattern();
  syncControls();
}

function isPrefixOfOption(listId, text) {
  const needle = text.toLowerCase();
  if (needle === '') return true;
  for (const option of el(listId).options) {
    if (option.value.toLowerCase().startsWith(needle)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------------ */
/* Rendering                                                                 */
/* ------------------------------------------------------------------------ */

let lastTitle = '';
let lastIconDay = '';

function renderFavicon(now) {
  // Keyed on the day (and zone, via wallClock) so the data URL is only
  // rebuilt when the date on the page actually changes.
  const { day } = wallClock(now, settings.tz || undefined);
  const key = String(day);
  if (key === lastIconDay) return;
  lastIconDay = key;
  const url = dateFaviconUrl(day);
  faviconLink.href = url;
  mockIcon.src = url;
}

/** Everything that is only worth drawing while the page is actually visible. */
function renderPage(now, title, formatted) {
  clockEl.textContent = title;
  mockTitle.textContent = title;
  const length = [...title].length;
  // CSSOM rather than a style attribute: the page's CSP forbids inline styles.
  clockEl.style.setProperty('--len', String(Math.max(length, 8)));
  charCount.textContent = `${length} character${length === 1 ? '' : 's'}`;
  // The fade follows actual layout -- a narrow window truncates much earlier
  // -- and the hint follows the fade *or* the typical width, so the preview
  // never contradicts itself (fade without hint, hint without fade).
  const cut = mockTitle.scrollWidth > mockTitle.clientWidth;
  mockTab.classList.toggle('is-truncated', cut);
  truncHint.hidden = !cut && length <= TYPICAL_TAB_CHARS;
  updateFormatNote(formatted);

  const base = { ...settings };
  for (const sample of presetList.querySelectorAll('.preset-sample')) {
    const preset = sample.dataset.preset;
    sample.textContent = formatTitle(now, { ...base, preset, prefix: '', suffix: '' });
  }

  const options = formatOptions(settings);
  for (const row of tokenRows.querySelectorAll('[data-token]')) {
    row.textContent = formatDate(now, row.dataset.token, options);
  }
}

function render() {
  const now = new Date();
  const formatted = formatTitle(now, settings);
  const title = formatted || FALLBACK_TITLE;
  // Assigning an unchanged title is not free: some browsers repaint the tab
  // strip or re-announce it.
  if (title !== lastTitle) {
    document.title = title;
    lastTitle = title;
  }
  renderFavicon(now);
  // A hidden page only needs its title and icon; skip the rest.
  if (!document.hidden) renderPage(now, title, formatted);
}

function buildTokenTable() {
  for (const { token, meaning } of TOKENS) {
    const tr = document.createElement('tr');
    const code = document.createElement('td');
    code.append(document.createElement('code'));
    code.firstChild.textContent = token;
    const what = document.createElement('td');
    what.textContent = meaning;
    const example = document.createElement('td');
    example.className = 'token-example';
    example.dataset.token = token;
    tr.append(code, what, example);
    tokenRows.append(tr);
  }
}

/* ------------------------------------------------------------------------ */
/* Scheduling                                                                */
/* ------------------------------------------------------------------------ */

let timer = 0;

/*
 * The wake-up timer runs in a worker when possible (see tick-worker.js for
 * why); a failed Worker construction -- an old engine, a strict embed --
 * falls back to a main-thread timer, which only differs once the tab has been
 * in the background for a while.
 */
let worker = null;
try {
  worker = new Worker('./tick-worker.js');
  worker.onmessage = tick;
  worker.onerror = () => {
    worker = null;
    schedule();
  };
} catch {
  worker = null;
}

/*
 * A chained timeout aimed at the next second (or minute) boundary rather
 * than setInterval(1000): setInterval drifts and can skip or repeat a second
 * as its phase wanders against the wall clock. Re-aiming every tick keeps
 * the title flipping right on the boundary.
 *
 * Only a hidden page may drop to once a minute: while visible, the token
 * table and preset samples (ss, X, LTS, Unix) change every second even when
 * the title itself does not.
 */
function schedule() {
  const interval = document.hidden ? tickInterval(resolvePattern(settings)) : 1000;
  const delay = msUntilNextTick(Date.now(), interval);
  clearTimeout(timer);
  if (worker) worker.postMessage(delay);
  else timer = setTimeout(tick, delay);
}

function tick() {
  render();
  schedule();
}

/*
 * Background tabs get their timers throttled (to 1/s at best, and in Chrome
 * to once a minute after a few minutes hidden), and a laptop waking from sleep
 * delivers a timer late. So whenever the page comes back into view -- or is
 * restored from the back/forward cache -- redraw at once and re-aim.
 */
document.addEventListener('visibilitychange', tick);
window.addEventListener('pageshow', tick);
window.addEventListener('focus', tick);

/* ------------------------------------------------------------------------ */
/* Events                                                                    */
/* ------------------------------------------------------------------------ */

function onChange(event) {
  readForm(event.target);
  saveStored(settings);
  updateUrl(settings);
  tick();
}

form.addEventListener('input', onChange);
form.addEventListener('change', onChange);
form.addEventListener('submit', (event) => event.preventDefault());

// A locale/zone left half-typed on blur snaps back to the value in effect,
// so the field never shows something other than what the title uses. Said
// out loud, because a silent revert is easy to miss -- and invisible to a
// screen reader, which never hears the error on a field it has left.
const FIELD_LABEL = { locale: 'Language', tz: 'Time zone' };
for (const name of ['locale', 'tz']) {
  form.elements[name].addEventListener('blur', () => {
    const input = form.elements[name];
    const typed = input.value.trim();
    const valid = name === 'tz' ? isValidTimeZone(typed) : canonicalLocale(typed) !== null;
    if (typed !== '' && !valid) {
      announce(
        `${FIELD_LABEL[name]} “${typed}” not recognised — kept ${settings[name] || 'the browser default'}.`,
      );
    }
    input.value = settings[name];
    markInvalid(name, false);
  });
}

let statusTimer = 0;
function announce(message) {
  status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.textContent = '';
  }, 4000);
}

el('copy').addEventListener('click', async () => {
  const href = location.href;
  try {
    await navigator.clipboard.writeText(href);
    announce('Link copied.');
  } catch {
    // Clipboard API needs a secure context and permission; fall back to
    // showing the link so it can be copied by hand.
    window.prompt('Copy this link:', href);
  }
});

el('reset').addEventListener('click', () => {
  settings = { ...DEFAULTS };
  saveStored(settings);
  updateUrl(settings);
  writeForm();
  tick();
  announce('Settings reset.');
});

/* ------------------------------------------------------------------------ */
/* Boot                                                                      */
/* ------------------------------------------------------------------------ */

buildPresetList();
buildDatalists();
buildTokenTable();
writeForm();
// Normalise the URL (drop invalid or default values) so "Copy link" hands out
// exactly the settings in effect. Storage is left alone -- see saveStored().
updateUrl(settings);
el('mock-url').textContent = location.host
  ? `${location.host}${location.pathname}`
  : 'datetime-tab';
tick();

/*
 * Offline copy and install-as-app. Only offered in a secure context (https or
 * localhost), where the API exists; a failure changes nothing about the clock,
 * so it is not worth surfacing.
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
