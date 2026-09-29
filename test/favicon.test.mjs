import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dateFaviconSvg, dateFaviconUrl } from '../web/favicon.js';

const numeral = (svg) => svg.match(/<text[^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/).slice(1);

test('shows the day of the month', () => {
  assert.equal(numeral(dateFaviconSvg(1))[1], '1');
  assert.equal(numeral(dateFaviconSvg(29))[1], '29');
});

test('two digits get a narrower numeral than one', () => {
  // Otherwise "28" runs into the page border at 16 px.
  assert.ok(Number(numeral(dateFaviconSvg(28))[0]) < Number(numeral(dateFaviconSvg(8))[0]));
  assert.equal(numeral(dateFaviconSvg(9))[0], numeral(dateFaviconSvg(1))[0]);
  assert.equal(numeral(dateFaviconSvg(10))[0], numeral(dateFaviconSvg(31))[0]);
});

test('colours can be overridden', () => {
  const svg = dateFaviconSvg(5, { face: '#000001', ink: '#000002', accent: '#000003' });
  for (const c of ['#000001', '#000002', '#000003']) assert.ok(svg.includes(c), c);
});

test('is a self-contained SVG data URL', () => {
  const url = dateFaviconUrl(10);
  assert.ok(url.startsWith('data:image/svg+xml,'));
  const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(svg, /href=/);
});

test('the static favicon.svg is the generated day-31 page', async () => {
  // Keeps the no-JS icon and the live one visually identical.
  const file = await readFile(new URL('../web/favicon.svg', import.meta.url), 'utf8');
  assert.equal(file.trim(), dateFaviconSvg(31));
});
