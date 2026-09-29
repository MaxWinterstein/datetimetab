/** Settings: URL/storage parsing, fallbacks, presets and the final title. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CUSTOM,
  canonicalLocale,
  controlsInEffect,
  DEFAULT_FORMAT,
  DEFAULTS,
  formatOptions,
  formatTitle,
  isValidTimeZone,
  PRESETS,
  parseSettings,
  resolvePattern,
  resolveSettings,
  toQueryString,
  toSearchParams,
  unbracketedWords,
  uses12h,
} from '../web/format.js';

const q = (s) => new URLSearchParams(s);
const norm = (s) => s.replace(/[\u00a0\u202f]/g, ' ');
const NOW = new Date('2026-09-29T12:05:07Z');
// Pin locale and zone: DEFAULTS deliberately mean "whatever the host uses".
const base = { ...DEFAULTS, locale: 'en-US', tz: 'Europe/Berlin' };

describe('parseSettings', () => {
  test('accepts every valid field', () => {
    assert.deepEqual(
      parseSettings(
        q('preset=iso&locale=de-de&tz=Asia/Kolkata&clock=12&seconds=0&prefix=⏰&suffix=Berlin'),
      ),
      {
        preset: 'iso',
        locale: 'de-DE',
        tz: 'Asia/Kolkata',
        clock: '12',
        seconds: false,
        prefix: '⏰',
        suffix: 'Berlin',
      },
    );
  });

  test('drops invalid values instead of failing', () => {
    assert.deepEqual(
      parseSettings(q('preset=nope&locale=not_a_locale!&tz=Mars/Olympus&clock=13&seconds=maybe')),
      {},
    );
  });

  test('ignores unknown keys and empty input', () => {
    assert.deepEqual(parseSettings(q('utm_source=x&foo=bar')), {});
    assert.deepEqual(parseSettings(q('')), {});
  });

  test('boolean spellings', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE']) {
      assert.equal(parseSettings(q(`seconds=${v}`)).seconds, true, v);
    }
    for (const v of ['0', 'false', 'no', 'off']) {
      assert.equal(parseSettings(q(`seconds=${v}`)).seconds, false, v);
    }
  });

  test('seconds ignores keys inherited from Object.prototype', () => {
    for (const v of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.deepEqual(parseSettings(q(`seconds=${v}`)), {}, v);
      assert.equal(resolveSettings(q(`seconds=${v}`)).seconds, DEFAULTS.seconds, v);
    }
  });

  test('a bare format implies the custom preset', () => {
    assert.deepEqual(parseSettings(q('format=HH:mm')), { format: 'HH:mm', preset: CUSTOM });
    assert.equal(parseSettings(q('format=HH:mm&preset=iso')).preset, 'iso');
  });

  test('blank format is ignored', () => {
    assert.deepEqual(parseSettings(q('format=%20%20')), {});
  });

  test('strips control characters and caps lengths', () => {
    assert.equal(parseSettings(q('prefix=a%0Ab%09c')).prefix, 'abc');
    assert.equal([...parseSettings(q(`suffix=${'x'.repeat(100)}`)).suffix].length, 24);
    assert.equal(parseSettings(q(`format=${'H'.repeat(500)}`)).format.length, 200);
    // Code points, not UTF-16 units: an emoji is never cut in half.
    assert.equal(parseSettings(q(`prefix=${'⏰'.repeat(30)}`)).prefix, '⏰'.repeat(24));
  });

  test('works with any object that has get()', () => {
    const map = new Map([['preset', 'unix']]);
    assert.deepEqual(parseSettings({ get: (k) => map.get(k) ?? null }), { preset: 'unix' });
  });
});

describe('validators', () => {
  test('time zones', () => {
    assert.ok(isValidTimeZone('Europe/Berlin'));
    assert.ok(isValidTimeZone('UTC'));
    assert.ok(!isValidTimeZone('Europe/Atlantis'));
    assert.ok(!isValidTimeZone(''));
    assert.ok(!isValidTimeZone(undefined));
  });

  test('locales are canonicalised', () => {
    assert.equal(canonicalLocale('en-us'), 'en-US');
    assert.equal(canonicalLocale('DE'), 'de');
    assert.equal(canonicalLocale('en_US'), null);
    assert.equal(canonicalLocale(''), null);
  });
});

describe('toSearchParams', () => {
  test('defaults serialise to nothing', () => {
    assert.equal(toSearchParams(DEFAULTS).toString(), '');
  });

  test('the default format is never carried', () => {
    assert.equal(toSearchParams({ ...DEFAULTS, preset: 'iso' }).toString(), 'preset=iso');
    assert.equal(
      toSearchParams({ ...DEFAULTS, preset: CUSTOM, format: 'HH:mm' }).toString(),
      'preset=custom&format=HH%3Amm',
    );
  });

  test('a custom format survives switching to a preset and back', () => {
    // Type a format, pick "Time only", reload: the format must still be there
    // when Custom is picked again -- and the preset must still be in effect.
    for (const preset of ['time', DEFAULTS.preset]) {
      const settings = { ...DEFAULTS, preset, format: 'HH [Uhr]' };
      const query = toSearchParams(settings).toString();
      assert.equal(query, `preset=${preset}&format=HH+%5BUhr%5D`);
      const back = resolveSettings(q(query));
      assert.equal(back.preset, preset);
      assert.equal(back.format, 'HH [Uhr]');
    }
  });

  test('round-trips through parseSettings', () => {
    const settings = {
      ...DEFAULTS,
      preset: CUSTOM,
      format: '[KW] W · HH:mm',
      locale: 'de-DE',
      tz: 'America/New_York',
      clock: '24',
      seconds: false,
      prefix: '🕰️',
      suffix: 'NYC',
    };
    assert.deepEqual({ ...DEFAULTS, ...parseSettings(toSearchParams(settings)) }, settings);
  });
});

test('toQueryString keeps : and / readable and still parses back', () => {
  const settings = { ...DEFAULTS, preset: CUSTOM, format: 'HH:mm [at] z', tz: 'Europe/Berlin' };
  const query = toQueryString(settings);
  assert.equal(query, 'preset=custom&format=HH:mm+%5Bat%5D+z&tz=Europe/Berlin');
  assert.deepEqual({ ...DEFAULTS, ...parseSettings(q(query)) }, settings);
});

describe('resolveSettings', () => {
  test('nothing anywhere gives the defaults', () => {
    assert.deepEqual(resolveSettings(q('')), DEFAULTS);
    assert.deepEqual(resolveSettings(q(''), q('')), DEFAULTS);
  });

  test('storage applies when the URL has no settings', () => {
    const s = resolveSettings(q('utm_source=mail'), q('preset=unix&prefix=T'));
    assert.equal(s.preset, 'unix');
    assert.equal(s.prefix, 'T');
  });

  test('URL wins entirely over storage', () => {
    const s = resolveSettings(q('preset=time'), q('preset=unix&prefix=T&tz=UTC'));
    assert.equal(s.preset, 'time');
    // Not blended: a shared link looks the same for everyone.
    assert.equal(s.prefix, '');
    assert.equal(s.tz, '');
  });

  test('an invalid URL value falls back to the default, not to storage', () => {
    const s = resolveSettings(q('tz=Nowhere/Land&preset=iso'), q('tz=UTC'));
    assert.equal(s.tz, '');
    assert.equal(s.preset, 'iso');
  });

  test('garbage stored value is harmless', () => {
    assert.deepEqual(resolveSettings(q(''), q('%%%&&==')), DEFAULTS);
  });
});

describe('presets', () => {
  const zones = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Kolkata'];
  const locales = ['en-US', 'en-GB', 'de-DE'];

  test('ids are unique and do not clash with custom', () => {
    const ids = PRESETS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(!ids.includes(CUSTOM));
    assert.ok(ids.includes(DEFAULTS.preset));
  });

  test('every preset produces a non-empty title in every combination', () => {
    for (const preset of PRESETS) {
      for (const tz of zones) {
        for (const locale of locales) {
          for (const clock of ['auto', '12', '24']) {
            for (const seconds of [true, false]) {
              const title = formatTitle(NOW, {
                ...DEFAULTS,
                preset: preset.id,
                tz,
                locale,
                clock,
                seconds,
              });
              assert.ok(
                title.trim().length > 0,
                `${preset.id} ${tz} ${locale} ${clock} ${seconds}`,
              );
            }
          }
        }
      }
    }
  });

  test('sample output', () => {
    const t = (over) => norm(formatTitle(NOW, { ...base, ...over }));
    assert.equal(t({ preset: 'clock', clock: '24' }), 'Tue 29 Sep · 14:05:07');
    assert.equal(t({ preset: 'clock', clock: '24', seconds: false }), 'Tue 29 Sep · 14:05');
    assert.equal(t({ preset: 'clock', clock: '12', seconds: false }), 'Tue 29 Sep · 2:05 PM');
    assert.equal(t({ preset: 'time', clock: '24' }), '14:05:07');
    assert.equal(t({ preset: 'iso' }), '2026-09-29T14:05:07+02:00');
    assert.equal(t({ preset: 'iso', seconds: false, clock: '12' }), '2026-09-29T14:05+02:00');
    assert.equal(t({ preset: 'locale', locale: 'de-DE' }), '29.09.2026, 14:05:07');
    assert.equal(t({ preset: 'date', locale: 'de-DE' }), 'Dienstag, 29. September 2026');
    assert.equal(t({ preset: 'week', clock: '24', seconds: false }), 'W40 · Tue 14:05');
    assert.equal(t({ preset: 'unix' }), '1790683507');
  });

  test('clock "auto" follows the locale', () => {
    assert.equal(uses12h({ ...base, locale: 'en-US' }), true);
    assert.equal(uses12h({ ...base, locale: 'de-DE' }), false);
    assert.equal(
      norm(formatTitle(NOW, { ...base, preset: 'time', locale: 'en-US' })),
      '2:05:07 PM',
    );
    assert.equal(formatTitle(NOW, { ...base, preset: 'time', locale: 'de-DE' }), '14:05:07');
  });

  test('custom preset uses the format, and falls back if it is empty', () => {
    assert.equal(resolvePattern({ ...base, preset: CUSTOM, format: 'HH' }), 'HH');
    assert.equal(resolvePattern({ ...base, preset: CUSTOM, format: '' }), DEFAULT_FORMAT);
  });

  test('unknown preset id falls back to the first preset', () => {
    assert.equal(
      resolvePattern({ ...base, preset: 'bogus' }),
      resolvePattern({ ...base, preset: PRESETS[0].id }),
    );
  });
});

describe('controlsInEffect', () => {
  test('seconds and clock are active only where they change the output', () => {
    const at = (preset, format) => controlsInEffect({ ...base, preset, format });
    assert.deepEqual(at('clock'), { seconds: true, clock: true });
    assert.deepEqual(at('time'), { seconds: true, clock: true });
    assert.deepEqual(at('iso'), { seconds: true, clock: false });
    assert.deepEqual(at('locale'), { seconds: true, clock: true });
    assert.deepEqual(at('date'), { seconds: false, clock: false });
    assert.deepEqual(at('week'), { seconds: true, clock: true });
    assert.deepEqual(at('unix'), { seconds: false, clock: false });
    // Custom: seconds come from the pattern; only LT/LTS listen to the toggle.
    assert.deepEqual(at(CUSTOM, 'h:mm A'), { seconds: false, clock: false });
    assert.deepEqual(at(CUSTOM, 'L LT'), { seconds: false, clock: true });
  });

  test('every preset id is covered', () => {
    for (const { id } of PRESETS)
      assert.equal(typeof controlsInEffect({ ...base, preset: id }).clock, 'boolean');
  });
});

describe('unbracketedWords', () => {
  test('flags words that mix tokens and stray letters', () => {
    assert.deepEqual(unbracketedWords('HH:mm Meeting'), ['Meeting']);
    assert.deepEqual(unbracketedWords('HH:mm Uhr at Uhr'), ['Uhr', 'at']);
  });

  test('bracketed text, pure token runs and single letters are fine', () => {
    assert.deepEqual(unbracketedWords('HH:mm [Uhr]'), []);
    assert.deepEqual(unbracketedWords('YYYYMMDD[T]HHmmss'), []);
    assert.deepEqual(unbracketedWords('dddd, LL · LTS'), []);
    assert.deepEqual(unbracketedWords(DEFAULT_FORMAT), []);
    for (const { id } of PRESETS) {
      assert.deepEqual(unbracketedWords(resolvePattern({ ...base, preset: id })), [], id);
    }
  });
});

describe('runtime defaults (what a first-time visitor gets)', () => {
  // Shape only: the text depends on the host's zone and language, which is
  // the point -- DEFAULTS leave both empty.
  test('every preset renders a non-empty title with empty locale and tz', () => {
    for (const { id } of PRESETS) {
      const settings = { ...DEFAULTS, preset: id };
      const title = formatTitle(NOW, settings);
      assert.equal(typeof title, 'string');
      assert.ok(title.length > 0, id);
    }
    assert.ok(formatTitle(NOW, DEFAULTS).length > 0);
  });

  test('uses12h resolves "auto" to a boolean for the host locale', () => {
    assert.equal(typeof uses12h(DEFAULTS), 'boolean');
  });
});

describe('formatTitle', () => {
  test('prefix and suffix are joined with spaces', () => {
    const s = { ...base, preset: 'time', clock: '24', prefix: '⏰', suffix: 'Berlin' };
    assert.equal(formatTitle(NOW, s), '⏰ 14:05:07 Berlin');
    assert.equal(formatTitle(NOW, { ...s, prefix: '' }), '14:05:07 Berlin');
  });

  test('formatOptions maps settings to Intl options', () => {
    assert.deepEqual(formatOptions(DEFAULTS), {
      locale: undefined,
      timeZone: undefined,
      hour12: undefined,
    });
    assert.deepEqual(formatOptions({ ...base, clock: '12' }), {
      locale: 'en-US',
      timeZone: 'Europe/Berlin',
      hour12: true,
    });
    assert.equal(formatOptions({ ...base, clock: '24' }).hour12, false);
  });
});
