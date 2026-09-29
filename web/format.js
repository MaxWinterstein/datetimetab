/**
 * Formatting and settings logic for datetime-tab.
 *
 * Deliberately pure: no DOM, no globals beyond Intl, so the whole thing can be
 * imported by `node --test` and exercised with fixed Date instances. Every
 * wall-clock value is derived through Intl.DateTimeFormat with an explicit
 * `timeZone` -- never Date#getHours() and friends -- because those read the
 * *host's* zone, which would make the output (and the tests) depend on where
 * the machine happens to be.
 */

/* ------------------------------------------------------------------------ */
/* Intl formatter cache                                                      */
/* ------------------------------------------------------------------------ */

/*
 * Constructing an Intl.DateTimeFormat is far more expensive than calling it,
 * and the title ticks every second with ~a dozen lookups per tick. The key
 * space is bounded by what the user picks, but someone typing time zones
 * letter by letter could still grow it, hence the crude size cap.
 */
const formatters = new Map();
const MAX_FORMATTERS = 256;

function dtf(locale, options) {
  const key = `${locale || ''}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    if (formatters.size >= MAX_FORMATTERS) formatters.clear();
    f = new Intl.DateTimeFormat(locale || undefined, options);
    formatters.set(key, f);
  }
  return f;
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

/* ------------------------------------------------------------------------ */
/* Wall clock                                                                */
/* ------------------------------------------------------------------------ */

/**
 * The wall-clock fields of `date` as seen in `timeZone` (IANA name; empty or
 * undefined means the runtime default).
 *
 * The numeric fields come from an `en-US` formatter on purpose: its parts are
 * plain ASCII digits whatever the user's locale, so they can be parsed. Names
 * (months, weekdays) are fetched separately in the user's locale.
 *
 * @param {Date} date
 * @param {string} [timeZone]
 * @returns {{year:number, month:number, day:number, hour:number, minute:number,
 *   second:number, weekday:number, offsetMinutes:number}}
 *   month is 1-12, weekday is ISO (1 = Monday ... 7 = Sunday).
 */
export function wallClock(date, timeZone) {
  const parts = dtf('en-US', {
    timeZone: timeZone || undefined,
    // h23 rather than hour12:false: the latter renders midnight as "24" in
    // some engines, which would then leak into HH.
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour') % 24;
  const minute = get('minute');
  const second = get('second');
  // Treat the wall clock as if it were UTC; the difference to the real
  // instant (truncated to whole seconds, as the fields are) is the offset.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const instant = Math.floor(date.getTime() / 1000) * 1000;
  const offsetMinutes = Math.round((asUtc - instant) / 60000);
  const weekday = ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
  return { year, month, day, hour, minute, second, weekday, offsetMinutes };
}

/**
 * ISO 8601 week number and week-numbering year for a calendar date.
 * The week belongs to the year that contains its Thursday, which is why
 * 1 January can be week 52/53 and 31 December can be week 1.
 */
export function isoWeek(year, month, day) {
  const t = Date.UTC(year, month - 1, day);
  const mondayBased = (new Date(t).getUTCDay() + 6) % 7;
  const thursday = t + (3 - mondayBased) * 86_400_000;
  const weekYear = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(weekYear, 0, 1);
  return { week: 1 + Math.floor((thursday - jan1) / (7 * 86_400_000)), year: weekYear };
}

function formatOffset(minutes, separator) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}${separator}${pad(abs % 60)}`;
}

/* ------------------------------------------------------------------------ */
/* Tokens                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * The token vocabulary, in the order the cheat sheet shows it. Largely
 * Moment/Day.js-compatible so the syntax is not one more thing to learn.
 */
export const TOKENS = Object.freeze([
  { token: 'YYYY', meaning: 'Year, four digits' },
  { token: 'YY', meaning: 'Year, two digits' },
  { token: 'MMMM', meaning: 'Month name' },
  { token: 'MMM', meaning: 'Month name, short' },
  { token: 'MM', meaning: 'Month, 01–12' },
  { token: 'M', meaning: 'Month, 1–12' },
  { token: 'DD', meaning: 'Day of month, 01–31' },
  { token: 'D', meaning: 'Day of month, 1–31' },
  { token: 'dddd', meaning: 'Weekday name' },
  { token: 'ddd', meaning: 'Weekday name, short' },
  { token: 'HH', meaning: 'Hour, 00–23' },
  { token: 'H', meaning: 'Hour, 0–23' },
  { token: 'hh', meaning: 'Hour, 01–12' },
  { token: 'h', meaning: 'Hour, 1–12' },
  { token: 'mm', meaning: 'Minute, 00–59' },
  { token: 'ss', meaning: 'Second, 00–59' },
  { token: 'A', meaning: 'AM / PM' },
  { token: 'a', meaning: 'am / pm' },
  { token: 'Z', meaning: 'UTC offset, +02:00' },
  { token: 'ZZ', meaning: 'UTC offset, +0200' },
  { token: 'z', meaning: 'Zone abbreviation' },
  { token: 'W', meaning: 'ISO week, 1–53' },
  { token: 'WW', meaning: 'ISO week, 01–53' },
  { token: 'GGGG', meaning: 'ISO week-year' },
  { token: 'X', meaning: 'Unix timestamp, seconds' },
  { token: 'L', meaning: 'Locale date' },
  { token: 'LL', meaning: 'Locale date, long' },
  { token: 'LT', meaning: 'Locale time' },
  { token: 'LTS', meaning: 'Locale time with seconds' },
  { token: '[text]', meaning: 'Literal text, not interpreted' },
]);

/*
 * One alternation, longest spelling first within each family, so `MMMM` is
 * never read as `MM` + `MM`. The bracket branch comes first: anything inside
 * [...] is literal. An unclosed `[` simply fails to match and falls through
 * as ordinary text.
 */
const TOKEN_RE =
  /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a|ZZ|Z|z|WW|W|GGGG|X|LTS|LT|LL|L/g;

/**
 * Splits a pattern into tokens and literal runs.
 * @param {string} pattern
 * @returns {Array<{token:string}|{literal:string}>}
 */
export function tokenize(pattern) {
  const out = [];
  let last = 0;
  for (const m of pattern.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push({ literal: pattern.slice(last, m.index) });
    out.push(m[1] !== undefined ? { literal: m[1] } : { token: m[0] });
    last = m.index + m[0].length;
  }
  if (last < pattern.length) out.push({ literal: pattern.slice(last) });
  return out;
}

const SECOND_TOKENS = new Set(['ss', 'X', 'LTS']);

/**
 * How often the output of `pattern` can change: 1000 ms if it shows seconds,
 * 60000 ms otherwise. Lets the app wake once a minute instead of 60 times.
 */
export function tickInterval(pattern) {
  return tokenize(pattern).some((p) => SECOND_TOKENS.has(p.token)) ? 1000 : 60_000;
}

/**
 * Milliseconds from `nowMs` until the next multiple of `interval`.
 *
 * Aligned to the epoch rather than to "now + interval", which is what keeps a
 * chained setTimeout from drifting the way setInterval does. Minute alignment
 * on the epoch is also minute alignment in every zone in use today -- all
 * current UTC offsets are whole minutes. The small margin guards against a
 * timer firing a hair early (Firefox rounds) and re-rendering the old second.
 */
export function msUntilNextTick(nowMs, interval, margin = 15) {
  return interval - (((nowMs % interval) + interval) % interval) + margin;
}

/** Month/weekday name in the given locale and zone. */
function namePart(date, locale, timeZone, options, type) {
  // Format together with the day so languages that decline month names
  // (ru, pl, cs ...) get the form used in dates -- "29 сентября", not the
  // nominative "сентябрь" a bare month would produce.
  const withDay = type === 'month' ? { day: 'numeric', ...options } : options;
  // Always Gregorian: D, YYYY and friends come from wallClock(), which is
  // Gregorian, so a locale whose default calendar differs (fa-IR, th-TH, or
  // any -u-ca- tag) would otherwise pair a Persian month name with a
  // Gregorian day -- "29 مهر 2026", a date that does not exist. The whole-date
  // tokens (L, LL, LT, LTS) keep the locale's calendar; they are consistent
  // on their own.
  const parts = dtf(locale, {
    timeZone: timeZone || undefined,
    calendar: 'gregory',
    ...withDay,
  }).formatToParts(date);
  return parts.find((p) => p.type === type)?.value ?? '';
}

/**
 * Formats `date` with a token pattern.
 *
 * @param {Date} date
 * @param {string} pattern see TOKENS
 * @param {{locale?:string, timeZone?:string, hour12?:boolean}} [options]
 *   locale/timeZone empty or undefined = runtime default. hour12 only affects
 *   the locale tokens (LT, LTS); the explicit tokens already say H vs h.
 * @returns {string}
 * @throws {RangeError} for an invalid time zone or locale -- validate first
 *   with isValidTimeZone() / isValidLocale().
 */
export function formatDate(date, pattern, options = {}) {
  const { locale, timeZone, hour12 } = options;
  const tz = timeZone || undefined;
  const w = wallClock(date, tz);
  const h12 = w.hour % 12 === 0 ? 12 : w.hour % 12;
  let week;
  const iso = () => {
    week ??= isoWeek(w.year, w.month, w.day);
    return week;
  };

  const values = {
    YYYY: () => pad(w.year, 4),
    YY: () => pad(w.year % 100),
    MMMM: () => namePart(date, locale, tz, { month: 'long' }, 'month'),
    MMM: () => namePart(date, locale, tz, { month: 'short' }, 'month'),
    MM: () => pad(w.month),
    M: () => String(w.month),
    DD: () => pad(w.day),
    D: () => String(w.day),
    dddd: () => namePart(date, locale, tz, { weekday: 'long' }, 'weekday'),
    ddd: () => namePart(date, locale, tz, { weekday: 'short' }, 'weekday'),
    HH: () => pad(w.hour),
    H: () => String(w.hour),
    hh: () => pad(h12),
    h: () => String(h12),
    mm: () => pad(w.minute),
    ss: () => pad(w.second),
    A: () => (w.hour < 12 ? 'AM' : 'PM'),
    a: () => (w.hour < 12 ? 'am' : 'pm'),
    Z: () => formatOffset(w.offsetMinutes, ':'),
    ZZ: () => formatOffset(w.offsetMinutes, ''),
    z: () => namePart(date, locale, tz, { timeZoneName: 'short' }, 'timeZoneName'),
    W: () => String(iso().week),
    WW: () => pad(iso().week),
    GGGG: () => pad(iso().year, 4),
    X: () => String(Math.floor(date.getTime() / 1000)),
    L: () => dtf(locale, { timeZone: tz, dateStyle: 'medium' }).format(date),
    LL: () => dtf(locale, { timeZone: tz, dateStyle: 'long' }).format(date),
    LT: () => dtf(locale, { timeZone: tz, timeStyle: 'short', hour12 }).format(date),
    LTS: () => dtf(locale, { timeZone: tz, timeStyle: 'medium', hour12 }).format(date),
  };

  let out = '';
  for (const part of tokenize(pattern)) {
    out += part.token ? values[part.token]() : part.literal;
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Presets                                                                   */
/* ------------------------------------------------------------------------ */

const clockPart = (seconds, h12) =>
  h12 ? (seconds ? 'h:mm:ss A' : 'h:mm A') : seconds ? 'HH:mm:ss' : 'HH:mm';

/**
 * Presets build their pattern from the seconds/12h options rather than being
 * fixed strings, so those two toggles mean something without the user having
 * to learn the token syntax.
 */
export const PRESETS = Object.freeze([
  {
    id: 'clock',
    label: 'Date and time',
    build: ({ seconds, h12 }) => `ddd D MMM · ${clockPart(seconds, h12)}`,
  },
  { id: 'time', label: 'Time only', build: ({ seconds, h12 }) => clockPart(seconds, h12) },
  {
    id: 'iso',
    label: 'ISO 8601',
    // ISO has no 12-hour form; the toggle is ignored here on purpose.
    build: ({ seconds }) => (seconds ? 'YYYY-MM-DD[T]HH:mm:ssZ' : 'YYYY-MM-DD[T]HH:mmZ'),
  },
  { id: 'locale', label: 'Locale default', build: ({ seconds }) => (seconds ? 'L, LTS' : 'L, LT') },
  { id: 'date', label: 'Date only', build: () => 'dddd, LL' },
  {
    id: 'week',
    label: 'Week number',
    build: ({ seconds, h12 }) => `[W]W · ddd ${clockPart(seconds, h12)}`,
  },
  { id: 'unix', label: 'Unix timestamp', build: () => 'X' },
]);

export const CUSTOM = 'custom';

/* ------------------------------------------------------------------------ */
/* Settings                                                                  */
/* ------------------------------------------------------------------------ */

export const DEFAULT_FORMAT = 'ddd D MMM · HH:mm:ss';

/**
 * Empty locale / tz mean "whatever the browser uses", resolved at format
 * time. Storing the resolved value instead would freeze a shared link to the
 * sender's zone, which is almost never what the recipient wants.
 */
export const DEFAULTS = Object.freeze({
  preset: 'clock',
  format: DEFAULT_FORMAT,
  locale: '',
  tz: '',
  clock: 'auto',
  seconds: true,
  prefix: '',
  suffix: '',
});

export const SETTING_KEYS = Object.freeze(Object.keys(DEFAULTS));

const MAX_FORMAT = 200;
const MAX_AFFIX = 24;

/** True if `tz` is an IANA zone (or alias) this runtime accepts. */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Canonical BCP 47 form of `locale`, or null if it is not well-formed. */
export function canonicalLocale(locale) {
  if (typeof locale !== 'string' || locale === '') return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(locale);
    return canonical ?? null;
  } catch {
    return null;
  }
}

export const isValidLocale = (locale) => canonicalLocale(locale) !== null;

/*
 * Control characters (including newlines) have no business in a tab title
 * and can come in through a hand-edited URL.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const clean = (s, max) => [...s.replace(CONTROL, '').trim()].slice(0, max).join('');

// Null prototype, so `seconds=constructor` or `seconds=__proto__` cannot
// match an inherited Object.prototype key; the lookup below uses hasOwn too.
const BOOL = Object.assign(Object.create(null), {
  1: true,
  true: true,
  yes: true,
  on: true,
  0: false,
  false: false,
  no: false,
  off: false,
});

/**
 * Validates whatever settings `params` contains. Anything missing or invalid
 * is simply left out, so the caller can layer the result over DEFAULTS and a
 * bad value degrades to the default instead of breaking the page.
 *
 * @param {URLSearchParams | {get(key:string): string|null}} params
 * @returns {Partial<typeof DEFAULTS>}
 */
export function parseSettings(params) {
  const out = {};
  const raw = (key) => {
    const v = params.get(key);
    return typeof v === 'string' ? v : null;
  };

  const preset = raw('preset');
  if (preset !== null && (preset === CUSTOM || PRESETS.some((p) => p.id === preset))) {
    out.preset = preset;
  }

  const format = raw('format');
  if (format !== null) {
    const f = clean(format, MAX_FORMAT);
    if (f) out.format = f;
  }

  const locale = canonicalLocale(raw('locale') ?? '');
  if (locale) out.locale = locale;

  const tz = raw('tz');
  if (tz !== null && isValidTimeZone(tz)) out.tz = tz;

  const clock = raw('clock');
  if (clock === '12' || clock === '24' || clock === 'auto') out.clock = clock;

  const seconds = raw('seconds')?.toLowerCase();
  if (seconds !== undefined && Object.hasOwn(BOOL, seconds)) out.seconds = BOOL[seconds];

  for (const key of ['prefix', 'suffix']) {
    const v = raw(key);
    if (v !== null) out[key] = clean(v, MAX_AFFIX);
  }

  // A custom format given without an explicit preset clearly means "use it".
  if (out.format && !out.preset) out.preset = CUSTOM;
  return out;
}

/**
 * Serialises settings, omitting anything equal to the default so shared
 * links stay short and readable.
 *
 * A non-default format is carried even while a preset is selected. It has no
 * effect there, but dropping it would lose the user's pattern on the round
 * trip through the URL and storage: "type a format, try a preset, reload, go
 * back to Custom" would bring back the default instead.
 * @returns {URLSearchParams}
 */
export function toSearchParams(settings) {
  const params = new URLSearchParams();
  const carryFormat = settings.format !== undefined && settings.format !== DEFAULT_FORMAT;
  for (const key of SETTING_KEYS) {
    const value = settings[key];
    if (value === undefined) continue;
    // A format without a preset reads as "custom" (see parseSettings), so
    // once the format is carried the preset must be spelled out, default or not.
    const needed = key === 'preset' && carryFormat;
    if (value === DEFAULTS[key] && !needed) continue;
    params.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return params;
}

/**
 * toSearchParams() as a query string, with `:` and `/` left unescaped. Both
 * are legal in a query (RFC 3986) and `tz=Europe/Berlin&format=HH:mm` is a
 * link people can read and hand-edit; URLSearchParams escapes them anyway.
 */
export function toQueryString(settings) {
  return toSearchParams(settings).toString().replace(/%3A/gi, ':').replace(/%2F/gi, '/');
}

const hasAnySetting = (params) => SETTING_KEYS.some((k) => params.get(k) !== null);

/**
 * Combines URL and stored settings over DEFAULTS.
 *
 * If the URL carries any setting at all it wins *entirely*: a shared or
 * bookmarked link must render the same for everyone, not be blended with
 * whatever the recipient configured last time. Only a bare URL falls back
 * to storage.
 *
 * @param {URLSearchParams} urlParams
 * @param {URLSearchParams} [storedParams]
 */
export function resolveSettings(urlParams, storedParams) {
  const source = hasAnySetting(urlParams) ? urlParams : storedParams;
  return { ...DEFAULTS, ...(source ? parseSettings(source) : {}) };
}

/** True if the locale's conventional clock is 12-hour. */
export function localeUses12h(locale) {
  try {
    const opts = dtf(locale, { hour: 'numeric' }).resolvedOptions();
    if (opts.hourCycle) return opts.hourCycle === 'h11' || opts.hourCycle === 'h12';
    return Boolean(opts.hour12);
  } catch {
    return false;
  }
}

/** Whether the settings call for a 12-hour clock, resolving "auto". */
export function uses12h(settings) {
  if (settings.clock === '12') return true;
  if (settings.clock === '24') return false;
  return localeUses12h(settings.locale);
}

/** The pattern the settings select (preset or custom). */
export function resolvePattern(settings) {
  if (settings.preset === CUSTOM) return settings.format || DEFAULT_FORMAT;
  const preset = PRESETS.find((p) => p.id === settings.preset) ?? PRESETS[0];
  return preset.build({ seconds: settings.seconds, h12: uses12h(settings) });
}

/** Intl options derived from settings, for formatDate(). */
export function formatOptions(settings) {
  return {
    locale: settings.locale || undefined,
    timeZone: settings.tz || undefined,
    hour12: settings.clock === 'auto' ? undefined : settings.clock === '12',
  };
}

/**
 * The complete tab title for `date`: prefix, formatted time, suffix,
 * separated by single spaces where present.
 */
export function formatTitle(date, settings) {
  const body = formatDate(date, resolvePattern(settings), formatOptions(settings));
  return [settings.prefix, body, settings.suffix].filter(Boolean).join(' ');
}

/*
 * Tokens whose output depends on the clock toggle: explicit 12 h / 24 h
 * tokens do not, the locale time tokens do (they get hour12 from the toggle).
 */
const CLOCK_TOKENS = new Set(['LT', 'LTS']);

/**
 * Which of the two quick toggles actually change the output for these
 * settings, so the UI can disable the ones that would visibly do nothing.
 * @returns {{seconds: boolean, clock: boolean}}
 */
export function controlsInEffect(settings) {
  const pattern = resolvePattern(settings);
  const usesLocaleTime = tokenize(pattern).some((p) => CLOCK_TOKENS.has(p.token));
  if (settings.preset === CUSTOM) return { seconds: false, clock: usesLocaleTime };
  const preset = PRESETS.find((p) => p.id === settings.preset) ?? PRESETS[0];
  const differs = (a, b) => preset.build(a) !== preset.build(b);
  return {
    seconds: differs({ seconds: true, h12: false }, { seconds: false, h12: false }),
    clock: usesLocaleTime || differs({ seconds: true, h12: true }, { seconds: true, h12: false }),
  };
}

/**
 * Plain words written without [brackets], e.g. "Meeting" or "Uhr": runs of
 * two or more letters that the tokenizer splits into a mix of tokens and
 * stray letters. Such a pattern "works" but prints garbage ("9eeting"), so
 * the UI points it out. Runs made only of tokens ("HHmm", "YYYY") are fine.
 * @param {string} pattern
 * @returns {string[]}
 */
export function unbracketedWords(pattern) {
  const outside = pattern.replace(/\[[^\]]*\]/g, ' ');
  const words = [];
  for (const [run] of outside.matchAll(/[A-Za-z]{2,}/g)) {
    const parts = tokenize(run);
    if (parts.some((p) => p.literal !== undefined) && parts.some((p) => p.token)) {
      if (!words.includes(run)) words.push(run);
    }
  }
  return words;
}
