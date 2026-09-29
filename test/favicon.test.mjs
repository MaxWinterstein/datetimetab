import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { clockFaviconSvg, clockFaviconUrl } from '../web/favicon.js';

const angles = (svg) => [...svg.matchAll(/rotate\(([\d.]+) 16 16\)/g)].map((m) => Number(m[1]));

test('hands point at the time', () => {
  assert.deepEqual(angles(clockFaviconSvg(0, 0)), [0, 0]);
  assert.deepEqual(angles(clockFaviconSvg(15, 30)), [105, 180]);
  // 12-hour dial: 21:45 draws like 9:45.
  assert.deepEqual(angles(clockFaviconSvg(21, 45)), angles(clockFaviconSvg(9, 45)));
});

test('is a self-contained SVG data URL', () => {
  const url = clockFaviconUrl(10, 10);
  assert.ok(url.startsWith('data:image/svg+xml,'));
  const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(svg, /href=/);
});

test('the static favicon.svg is the generated 10:10 clock', async () => {
  // Keeps the no-JS icon and the live one visually identical.
  const file = await readFile(new URL('../web/favicon.svg', import.meta.url), 'utf8');
  assert.equal(file.trim(), clockFaviconSvg(10, 10));
});
