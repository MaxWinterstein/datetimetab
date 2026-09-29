/**
 * The tab icon is a tear-off calendar page showing today's day of the month:
 * the date is what sets this page apart from every other tab clock, and the
 * time is already spelled out in the title right next to it. (A clock badge
 * in the corner was tried and dropped -- at 16 px it only covered the digits.)
 *
 * Pure string building (no DOM) so it can be tested; the app turns the result
 * into a data: URL. Drawn on a 32-unit grid with thick strokes and a heavy
 * numeral because it is rendered at 16 px -- anything finer turns to mush in
 * a tab strip.
 */

/**
 * @param {number} day 1-31
 * @param {{face?:string, ink?:string, accent?:string}} [colors]
 * @returns {string} SVG markup
 */
export function dateFaviconSvg(day, colors = {}) {
  const { face = '#fbf8f2', ink = '#1b1a17', accent = '#d9481f' } = colors;
  // A single digit can be taller; two have to share the page's width.
  const size = day >= 10 ? 18 : 20;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>datetime-tab</title>',
    `<rect x="2" y="4" width="28" height="26" rx="4" fill="${face}" stroke="${ink}" stroke-width="2.5"/>`,
    // Header band, clipped by hand to the page's rounded top corners.
    `<path d="M3.25 11.5V8A2.75 2.75 0 0 1 6 5.25h20A2.75 2.75 0 0 1 28.75 8v3.5z" fill="${accent}"/>`,
    `<line x1="2" y1="11.5" x2="30" y2="11.5" stroke="${ink}" stroke-width="2"/>`,
    // Binder rings.
    `<g stroke="${ink}" stroke-width="2.5" stroke-linecap="round"><line x1="10" y1="1.75" x2="10" y2="7"/><line x1="22" y1="1.75" x2="22" y2="7"/></g>`,
    `<text x="16" y="27.25" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif" font-weight="800" font-size="${size}" letter-spacing="-1" fill="${ink}">${day}</text>`,
    '</svg>',
  ].join('');
}

/** dateFaviconSvg() as a data: URL usable in <link rel="icon">. */
export const dateFaviconUrl = (day, colors) =>
  `data:image/svg+xml,${encodeURIComponent(dateFaviconSvg(day, colors))}`;
