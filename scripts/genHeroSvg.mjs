// Generates assets/hero-arrow.svg — a self-drawing, looping, hand-drawn arrow
// for the README. Uses the same rough.js engine the library draws with, so the
// asset matches the product's sketchy look. Pure SVG + CSS animation (no JS),
// so it renders and animates inside a GitHub README via <img>.
//
// Run: node scripts/genHeroSvg.mjs

import rough from 'roughjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 640;
const H = 220;
const SW = 2.5;
const SEED = 7;

// Two colorways so the README hero reads on both GitHub themes (an <img>-loaded
// SVG can't inherit currentColor, so we emit one per theme and pick via
// <picture media="(prefers-color-scheme: dark)">).
const COLORWAYS = [
  { name: 'light', stroke: '#1b1f24' }, // dark ink for light backgrounds
  { name: 'dark', stroke: '#e7e9ee' }, // light ink for dark backgrounds
];

const gen = rough.generator();

// Geometry only — rough.js path `d` strings are independent of stroke color,
// which we apply per-colorway via CSS below.

// A gentle hand-drawn arc from lower-left to upper-right (the "scroll arrow").
const shaft = gen.curve(
  [
    [48, 168],
    [210, 96],
    [400, 150],
    [592, 64],
  ],
  { roughness: 0.85, bowing: 1.2, strokeWidth: SW, seed: SEED },
);

// Arrowhead — two short strokes meeting at the shaft's end point (592, 64).
const headA = gen.line(592, 64, 556, 58, {
  roughness: 0.8,
  strokeWidth: SW,
  seed: SEED + 1,
});
const headB = gen.line(592, 64, 566, 90, {
  roughness: 0.8,
  strokeWidth: SW,
  seed: SEED + 2,
});

const dOf = (drawable) =>
  gen
    .toPaths(drawable)
    .map((p) => p.d)
    .join(' ');

const shaftD = dOf(shaft);
const headAD = dOf(headA);
const headBD = dOf(headB);

// Dash lengths are deliberately generous so we never need DOM path measurement:
// dasharray >= actual length means offset=full -> hidden, offset=0 -> fully drawn.
const SHAFT_DASH = 1400;
const HEAD_DASH = 90;

// Loop: shaft draws, then the two head strokes, hold, then reset and pause.
// One 4s cycle. Percentages are shared across all three paths so the head only
// begins after the shaft is essentially complete.
const buildSvg = (stroke) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="A hand-drawn arrow drawing itself">
  <style>
    .ink { fill: none; stroke: ${stroke}; stroke-width: ${SW}; stroke-linecap: round; stroke-linejoin: round; }
    .shaft { stroke-dasharray: ${SHAFT_DASH}; stroke-dashoffset: ${SHAFT_DASH}; animation: draw-shaft 4s ease-in-out infinite; }
    .head  { stroke-dasharray: ${HEAD_DASH};  stroke-dashoffset: ${HEAD_DASH};  animation: draw-head 4s ease-in-out infinite; }
    @keyframes draw-shaft {
      0%   { stroke-dashoffset: ${SHAFT_DASH}; }
      45%  { stroke-dashoffset: 0; }
      92%  { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: ${SHAFT_DASH}; }
    }
    @keyframes draw-head {
      0%   { stroke-dashoffset: ${HEAD_DASH}; }
      45%  { stroke-dashoffset: ${HEAD_DASH}; }
      62%  { stroke-dashoffset: 0; }
      92%  { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: ${HEAD_DASH}; }
    }
    @media (prefers-reduced-motion: reduce) {
      .shaft, .head { animation: none; stroke-dashoffset: 0; }
    }
  </style>
  <path class="ink shaft" d="${shaftD}" />
  <path class="ink head" d="${headAD}" />
  <path class="ink head" d="${headBD}" />
</svg>
`;

mkdirSync('assets', { recursive: true });
for (const { name, stroke } of COLORWAYS) {
  const svg = buildSvg(stroke);
  writeFileSync(`assets/hero-arrow-${name}.svg`, svg);
  console.log(`Wrote assets/hero-arrow-${name}.svg`, svg.length, 'bytes');
}
