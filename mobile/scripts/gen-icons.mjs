// Rasterizes the Riddhi brand marks into the PNGs Expo needs.
// Icon/adaptive/favicon SVGs are composed here from a single shared mark
// path; the splash image reuses assets/brand/logomark.svg. Run: npm run gen:icons
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');

// Shared "R" mark. bbox: x[100,466] (w 366), y[313,760] (h 447).
const MARK =
  'M100 313L466 313L466 367L402 367L412 381L419 395L426 417L427 428L466 429L466 482L428 482L421 510L411 531L390 557L388 557L382 564L366 575L335 589L311 595L286 598L237 598L435 760L299 760L285 747L283 747L259 726L257 726L254 722L242 714L238 709L236 709L212 688L210 688L207 684L195 676L191 671L189 671L165 650L163 650L160 646L148 638L144 633L142 633L139 629L137 629L118 612L116 612L113 608L100 599L100 517L281 517L299 513L312 506L324 495L331 483L100 482L100 428L330 428L325 417L315 407L301 399L281 394L100 394L100 314Z';

const BG_DEFS = `
  <linearGradient id="bg" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop stop-color="#241b3d"/><stop offset="1" stop-color="#120e1e"/>
  </linearGradient>
  <radialGradient id="rg" cx="0.5" cy="0.22" r="0.75">
    <stop stop-color="#9678f0" stop-opacity="0.32"/>
    <stop offset="0.65" stop-color="#9678f0" stop-opacity="0"/>
  </radialGradient>`;

// Full-bleed square: brand gradient + centered mark (matches 1a-app-icon layout,
// minus the rounded corners iOS masks itself).
const iconSquare = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${BG_DEFS}
    <filter id="tg" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26"/></filter>
    <path id="m" fill-rule="evenodd" d="${MARK}"/>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#rg)"/>
  <g transform="translate(123.93 5.63) scale(0.47)">
    <use href="#m" fill="#9678f0" opacity="0.5" filter="url(#tg)"/>
    <use href="#m" fill="#b6a4f3"/>
  </g>
</svg>`;

// Brand-gradient square, no mark (Android adaptive background layer).
const adaptiveBackground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${BG_DEFS}</defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#rg)"/>
</svg>`;

// Mark centered at ~60% of the canvas on transparent — the Android adaptive
// safe zone. translate(-100 -313) moves the mark bbox to the origin first.
const centeredMark = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path fill-rule="evenodd" fill="${fill}"
        transform="translate(130.25 102.4) scale(0.6873) translate(-100 -313)" d="${MARK}"/>
</svg>`;

function render(svg, width, background) {
  const opts = { fitTo: { mode: 'width', value: width } };
  if (background) opts.background = background;
  return new Resvg(svg, opts).render().asPng();
}

const logomarkSvg = readFileSync(join(assets, 'brand', 'logomark.svg'), 'utf8');

const jobs = [
  ['icon.png', render(iconSquare, 1024, '#14101f')],
  ['android-icon-background.png', render(adaptiveBackground, 1024, '#14101f')],
  ['android-icon-foreground.png', render(centeredMark('#b6a4f3'), 1024)],
  ['android-icon-monochrome.png', render(centeredMark('#ffffff'), 1024)],
  ['favicon.png', render(iconSquare, 48, '#14101f')],
  ['splash-icon.png', render(logomarkSvg, 512)],
];

for (const [name, png] of jobs) {
  writeFileSync(join(assets, name), png);
  console.log(`✓ ${name} (${png.length} bytes)`);
}
