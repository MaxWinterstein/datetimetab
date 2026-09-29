/**
 * The tab icon is a tiny analogue clock showing the same time as the title.
 *
 * Pure string building (no DOM) so it can be tested; the app turns the result
 * into a data: URL. Drawn on a 32-unit grid with thick strokes because it is
 * rendered at 16 px -- anything finer turns to mush in a tab strip.
 */

/**
 * @param {number} hours 0-23
 * @param {number} minutes 0-59
 * @param {{face?:string, ink?:string, accent?:string}} [colors]
 * @returns {string} SVG markup
 */
export function clockFaviconSvg(hours, minutes, colors = {}) {
  const { face = '#fbf8f2', ink = '#1b1a17', accent = '#d9481f' } = colors;
  const hourAngle = ((hours % 12) + minutes / 60) * 30;
  const minuteAngle = minutes * 6;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>tabclock</title>',
    `<circle cx="16" cy="16" r="14" fill="${face}" stroke="${ink}" stroke-width="3"/>`,
    `<g stroke="${ink}" stroke-width="3" stroke-linecap="round">`,
    `<line x1="16" y1="16" x2="16" y2="9" transform="rotate(${hourAngle.toFixed(1)} 16 16)"/>`,
    '</g>',
    `<line x1="16" y1="16" x2="16" y2="6" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" transform="rotate(${minuteAngle} 16 16)"/>`,
    `<circle cx="16" cy="16" r="2" fill="${ink}"/>`,
    '</svg>',
  ].join('');
}

/** clockFaviconSvg() as a data: URL usable in <link rel="icon">. */
export const clockFaviconUrl = (hours, minutes, colors) =>
  `data:image/svg+xml,${encodeURIComponent(clockFaviconSvg(hours, minutes, colors))}`;
