/**
 * Token formatting. Every call passes an explicit timeZone: the suite must
 * give the same answer on a laptop in Berlin and a CI runner in UTC.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  formatDate,
  isoWeek,
  localeUses12h,
  msUntilNextTick,
  TOKENS,
  tickInterval,
  tokenize,
  wallClock,
} from '../web/format.js';

// ICU puts U+202F / U+00A0 before AM/PM and inside some dates, and which one
// varies across ICU versions. Compare on plain spaces.
const norm = (s) => s.replace(/[\u00a0\u202f]/g, ' ');
const fmt = (iso, pattern, opts) => norm(formatDate(new Date(iso), pattern, opts));

const NOON_UTC = '2026-09-29T12:05:07.250Z';

describe('numeric tokens across time zones', () => {
  const cases = [
    ['UTC', '2026-09-29 12:05:07 +00:00 +0000'],
    ['Europe/Berlin', '2026-09-29 14:05:07 +02:00 +0200'],
    ['America/New_York', '2026-09-29 08:05:07 -04:00 -0400'],
    ['Asia/Kolkata', '2026-09-29 17:35:07 +05:30 +0530'],
  ];
  for (const [timeZone, expected] of cases) {
    test(timeZone, () => {
      assert.equal(fmt(NOON_UTC, 'YYYY-MM-DD HH:mm:ss Z ZZ', { timeZone }), expected);
    });
  }

  test('date rolls over with the zone, not the host', () => {
    // 23:30 UTC on the 31st is already 1 January in Kolkata.
    const iso = '2026-12-31T23:30:00Z';
    assert.equal(fmt(iso, 'YYYY-MM-DD', { timeZone: 'UTC' }), '2026-12-31');
    assert.equal(fmt(iso, 'YYYY-MM-DD HH:mm', { timeZone: 'Asia/Kolkata' }), '2027-01-01 05:00');
    assert.equal(
      fmt(iso, 'YYYY-MM-DD HH:mm', { timeZone: 'America/New_York' }),
      '2026-12-31 18:30',
    );
  });

  test('unpadded variants', () => {
    assert.equal(fmt('2026-03-04T05:06:07Z', 'YY M D H h', { timeZone: 'UTC' }), '26 3 4 5 5');
    assert.equal(
      fmt('2026-03-04T05:06:07Z', 'YY MM DD HH hh', { timeZone: 'UTC' }),
      '26 03 04 05 05',
    );
  });

  test('X is the unix timestamp in whole seconds, zone-independent', () => {
    for (const timeZone of ['UTC', 'Asia/Kolkata']) {
      assert.equal(fmt(NOON_UTC, 'X', { timeZone }), '1790683507');
    }
  });
});

describe('Europe/Berlin across DST', () => {
  const timeZone = 'Europe/Berlin';

  test('spring forward: 01:59:59 UTC+1 is followed by 03:00:00 UTC+2', () => {
    assert.equal(fmt('2026-03-29T00:59:59Z', 'HH:mm:ss Z', { timeZone }), '01:59:59 +01:00');
    assert.equal(fmt('2026-03-29T01:00:00Z', 'HH:mm:ss Z', { timeZone }), '03:00:00 +02:00');
  });

  test('fall back: 02:30 happens twice with different offsets', () => {
    assert.equal(fmt('2026-10-25T00:30:00Z', 'HH:mm Z', { timeZone }), '02:30 +02:00');
    assert.equal(fmt('2026-10-25T01:30:00Z', 'HH:mm Z', { timeZone }), '02:30 +01:00');
  });

  test('zone abbreviation follows DST and locale', () => {
    assert.equal(fmt('2026-07-01T12:00:00Z', 'z', { timeZone, locale: 'de-DE' }), 'MESZ');
    assert.equal(fmt('2026-01-01T12:00:00Z', 'z', { timeZone, locale: 'de-DE' }), 'MEZ');
    assert.equal(
      fmt('2026-07-01T12:00:00Z', 'z', { timeZone: 'America/New_York', locale: 'en-US' }),
      'EDT',
    );
  });
});

describe('names via Intl', () => {
  test('English', () => {
    assert.equal(
      fmt(NOON_UTC, 'dddd ddd MMMM MMM', { timeZone: 'UTC', locale: 'en-US' }),
      'Tuesday Tue September Sep',
    );
  });

  test('German', () => {
    assert.equal(
      fmt(NOON_UTC, 'dddd, D. MMMM YYYY', { timeZone: 'UTC', locale: 'de-DE' }),
      'Dienstag, 29. September 2026',
    );
    assert.equal(fmt('2026-03-02T12:00:00Z', 'MMMM', { timeZone: 'UTC', locale: 'de' }), 'März');
  });

  test('month names are the genitive form used inside a date', () => {
    // Formatted together with the day on purpose; a bare month would give
    // the nominative "сентябрь" / "wrzesień".
    assert.equal(fmt(NOON_UTC, 'D MMMM', { timeZone: 'UTC', locale: 'ru' }), '29 сентября');
    assert.equal(fmt(NOON_UTC, 'D MMMM', { timeZone: 'UTC', locale: 'pl' }), '29 września');
  });

  test('names are Gregorian, to match the Gregorian numbers', () => {
    // fa-IR defaults to the Persian calendar: its month for 29 Sep is مهر.
    // Pairing that with day 29 and year 2026 would name a date that does not
    // exist.
    const fa = fmt(NOON_UTC, 'D MMMM YYYY', { timeZone: 'UTC', locale: 'fa-IR' });
    assert.ok(fa.includes('سپتامبر'), fa);
    assert.ok(!fa.includes('مهر'), fa);
    assert.equal(
      fmt(NOON_UTC, 'D MMMM YYYY', { timeZone: 'UTC', locale: 'en-u-ca-hebrew' }),
      '29 September 2026',
    );
    assert.equal(fmt(NOON_UTC, 'MMM', { timeZone: 'UTC', locale: 'th-TH' }), 'ก.ย.');
  });

  test('weekday name uses the target zone', () => {
    // Monday 23:00 in New York is Tuesday in UTC.
    const iso = '2026-09-29T03:00:00Z';
    assert.equal(fmt(iso, 'dddd', { timeZone: 'UTC', locale: 'en' }), 'Tuesday');
    assert.equal(fmt(iso, 'dddd', { timeZone: 'America/New_York', locale: 'en' }), 'Monday');
  });

  test('locale tokens', () => {
    const en = { timeZone: 'UTC', locale: 'en-US' };
    const de = { timeZone: 'Europe/Berlin', locale: 'de-DE' };
    assert.equal(fmt(NOON_UTC, 'L', en), 'Sep 29, 2026');
    assert.equal(fmt(NOON_UTC, 'LL', en), 'September 29, 2026');
    assert.equal(fmt(NOON_UTC, 'LT', en), '12:05 PM');
    assert.equal(fmt(NOON_UTC, 'LTS', en), '12:05:07 PM');
    assert.equal(fmt(NOON_UTC, 'L LT', de), '29.09.2026 14:05');
    assert.equal(fmt(NOON_UTC, 'LL', de), '29. September 2026');
  });

  test('hour12 overrides the locale for LT/LTS only', () => {
    assert.equal(fmt(NOON_UTC, 'LT', { timeZone: 'UTC', locale: 'en-US', hour12: false }), '12:05');
    assert.equal(
      fmt(NOON_UTC, 'LT', { timeZone: 'UTC', locale: 'de-DE', hour12: true }),
      '12:05 PM',
    );
    assert.equal(fmt(NOON_UTC, 'HH', { timeZone: 'UTC', hour12: true }), '12');
  });
});

describe('12-hour clock', () => {
  const at = (hhmm) => `2026-09-29T${hhmm}:00Z`;
  const o = { timeZone: 'UTC' };

  test('midnight is 12 AM, not 0', () => {
    assert.equal(fmt(at('00:00'), 'h:mm A|hh a|HH|H', o), '12:00 AM|12 am|00|0');
  });

  test('noon is 12 PM', () => {
    assert.equal(fmt(at('12:00'), 'h:mm A|hh a|HH', o), '12:00 PM|12 pm|12');
  });

  test('just before midnight and just after noon', () => {
    assert.equal(fmt(at('23:59'), 'h:mm A', o), '11:59 PM');
    assert.equal(fmt(at('13:01'), 'hh:mm a', o), '01:01 pm');
    assert.equal(fmt(at('11:59'), 'h:mm A', o), '11:59 AM');
  });
});

describe('ISO week', () => {
  const cases = [
    // [date, week, week-year]
    ['2026-01-01', 1, 2026], // Thursday -> week 1 of its own year
    ['2021-01-01', 53, 2020], // Friday -> last week of the previous year
    ['2022-01-01', 52, 2021], // Saturday
    ['2023-01-01', 52, 2022], // Sunday
    ['2024-01-01', 1, 2024], // Monday
    ['2024-12-30', 1, 2025], // Monday in December already in next year's week 1
    ['2025-12-31', 1, 2026], // Wednesday, 31 Dec -> week 1
    ['2026-12-31', 53, 2026], // Thursday, 2026 has 53 weeks
    ['2027-01-03', 53, 2026], // Sunday closing that week
    ['2027-01-04', 1, 2027],
    ['2026-09-29', 40, 2026],
  ];
  for (const [date, week, year] of cases) {
    test(`${date} is W${week} of ${year}`, () => {
      const [y, m, d] = date.split('-').map(Number);
      assert.deepEqual(isoWeek(y, m, d), { week, year });
      assert.equal(
        fmt(`${date}T12:00:00Z`, 'W WW GGGG', { timeZone: 'UTC' }),
        `${week} ${String(week).padStart(2, '0')} ${year}`,
      );
    });
  }

  test('week follows the zone at the year boundary', () => {
    // Sunday 3 Jan 2027 23:30 UTC is already Monday in Berlin: new week.
    const iso = '2027-01-03T23:30:00Z';
    assert.equal(fmt(iso, 'W', { timeZone: 'UTC' }), '53');
    assert.equal(fmt(iso, 'W', { timeZone: 'Europe/Berlin' }), '1');
  });
});

describe('escaping and tokenizing', () => {
  const o = { timeZone: 'UTC', locale: 'en-US' };

  test('bracketed text is literal', () => {
    assert.equal(fmt(NOON_UTC, '[Today is] dddd', o), 'Today is Tuesday');
    assert.equal(fmt(NOON_UTC, 'HH[h]mm', o), '12h05');
    assert.equal(fmt(NOON_UTC, '[YYYY MM DD]', o), 'YYYY MM DD');
    assert.equal(fmt(NOON_UTC, '[W]W', o), 'W40');
  });

  test('empty brackets vanish; unclosed bracket stays text', () => {
    assert.equal(fmt(NOON_UTC, 'HH[]mm', o), '1205');
    assert.equal(fmt(NOON_UTC, '[HH', o), '[12');
  });

  test('unknown letters and punctuation pass through', () => {
    assert.equal(fmt(NOON_UTC, 'HH:mm · ✓ — q', o), '12:05 · ✓ — q');
    assert.equal(fmt(NOON_UTC, '', o), '');
  });

  test('longest token wins', () => {
    assert.deepEqual(
      tokenize('MMMMMM').map((p) => p.token),
      ['MMMM', 'MM'],
    );
    assert.deepEqual(
      tokenize('LTSLTLLL').map((p) => p.token),
      ['LTS', 'LT', 'LL', 'L'],
    );
  });

  test('every documented token formats to something', () => {
    for (const { token } of TOKENS) {
      if (token.startsWith('[')) continue;
      const out = formatDate(new Date(NOON_UTC), token, o);
      assert.ok(out.length > 0, token);
      assert.notEqual(out, token, `${token} was not interpreted`);
    }
  });
});

describe('wallClock', () => {
  test('reports ISO weekday and offset', () => {
    const w = wallClock(new Date(NOON_UTC), 'Asia/Kolkata');
    assert.deepEqual(w, {
      year: 2026,
      month: 9,
      day: 29,
      hour: 17,
      minute: 35,
      second: 7,
      weekday: 2,
      offsetMinutes: 330,
    });
    assert.equal(wallClock(new Date('2026-10-04T12:00:00Z'), 'UTC').weekday, 7);
  });

  test('midnight is hour 0', () => {
    assert.equal(wallClock(new Date('2026-09-29T00:00:00Z'), 'UTC').hour, 0);
  });
});

describe('scheduling helpers', () => {
  test('tickInterval: second tokens tick every second, others every minute', () => {
    assert.equal(tickInterval('HH:mm:ss'), 1000);
    assert.equal(tickInterval('X'), 1000);
    assert.equal(tickInterval('L, LTS'), 1000);
    assert.equal(tickInterval('HH:mm'), 60_000);
    assert.equal(tickInterval('L, LT'), 60_000);
    assert.equal(tickInterval('dddd'), 60_000);
    // Escaped "ss" is text, not seconds.
    assert.equal(tickInterval('HH:mm [ss]'), 60_000);
    assert.equal(tickInterval('LT'), 60_000);
    assert.equal(tickInterval('h:mm A'), 60_000);
  });

  test('msUntilNextTick aims at the next boundary', () => {
    assert.equal(msUntilNextTick(10_250, 1000, 0), 750);
    assert.equal(msUntilNextTick(10_000, 1000, 0), 1000);
    assert.equal(msUntilNextTick(125_000, 60_000, 0), 55_000);
    assert.equal(msUntilNextTick(10_999, 1000, 15), 16);
  });
});

describe('error and fallback contracts', () => {
  test('formatDate throws RangeError for an unknown zone instead of guessing', () => {
    // app.js validates first; silently falling back to the host zone here
    // would show a confidently wrong time.
    assert.throws(() => formatDate(new Date(0), 'HH', { timeZone: 'Mars/Olympus' }), RangeError);
  });

  test('localeUses12h swallows a malformed tag and says 24 h', () => {
    assert.equal(localeUses12h('en_US!'), false);
    assert.equal(localeUses12h('en-US'), true);
    assert.equal(localeUses12h('de-DE'), false);
  });
});

test('"your own zone" follows a change of the system zone', async () => {
  // A pinned tab outlives trips and OS zone changes. The default zone used to
  // be frozen into cached formatters, so the title kept the old time -- and
  // formatters created later used the new one, mixing zones in one title.
  const previous = process.env.TZ;
  const at = new Date('2026-06-01T12:00:00Z');
  try {
    process.env.TZ = 'Europe/Berlin';
    await new Promise((r) => setTimeout(r, 1_050));
    assert.equal(formatDate(at, 'HH:mm Z', {}), '14:00 +02:00');
    process.env.TZ = 'Asia/Tokyo';
    // The default zone is re-resolved at most once a second.
    await new Promise((r) => setTimeout(r, 1_050));
    assert.equal(formatDate(at, 'HH:mm Z', {}), '21:00 +09:00');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
