# scroll-arrows

[![CI](https://github.com/dancj/scroll-arrows/actions/workflows/ci.yml/badge.svg)](https://github.com/dancj/scroll-arrows/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/scroll-arrows.svg)](https://www.npmjs.com/package/scroll-arrows)
[![bundle size](https://img.shields.io/bundlejs/size/scroll-arrows)](https://bundlejs.com/?q=scroll-arrows)
[![license](https://img.shields.io/github/license/dancj/scroll-arrows.svg)](./LICENSE)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/hero-arrow-dark.svg" />
    <img alt="A hand-drawn arrow drawing itself" src="./assets/hero-arrow-light.svg" width="640" />
  </picture>
</p>

Hand-drawn arrows that **draw themselves between two elements as you scroll**.
A single `roughness` knob slides from clean straight lines (0) to scratchy,
curvy scribbles (1) — same sketchy engine as Excalidraw ([rough.js]).

Framework-agnostic core + a thin React wrapper. Arrows live in a click-through
overlay `<svg>`, auto-track their endpoints with `ResizeObserver`, and draw on
scroll progress.

```bash
npm install scroll-arrows
```

## Vanilla

```ts
import { scrollArrow } from 'scroll-arrows';

const arrow = scrollArrow({
  start: '#box-a', // Element or CSS selector
  end: '#box-b',
  roughness: 0.7, // 0 clean → 1 scratchy
  stroke: '#e7e9ee',
  strokeWidth: 2.5,
  head: 'end', // "start" | "end" | "both" | "none"
});

// later
arrow.destroy();
```

## How it works

- **Anchoring** — pass two elements; the arrow picks the best edges (`auto`
  sockets) and recomputes when they move or resize. Override with
  `startSocket` / `endSocket`.
- **Scroll draw** — progress is driven by a target's travel through the
  viewport (`scroll.range`, fractions of viewport height, default `[0.85, 0.35]`).
  `speed` finishes the stroke earlier/later; `easing` shapes the curve.
- **Roughness** — one knob mapped onto rough.js `roughness`/`bowing` plus path
  curvature. `seed` keeps a given arrow's scribble stable across renders.
  Endpoints stay pinned to the anchors at any roughness (`anchorEnds`, default
  true); set it false to let scratchy ends wander off the targets.
- **Obstacle routing** — pass `avoid` (an element or array) and the curve bows
  around them with an `avoidPadding` gap instead of cutting through. Single-bend
  router: it clears the worst blocker, not a full path-finder.
- **Hidden anchors (tabs / accordions)** — an anchor inside a `display:none`
  container has no box, so the arrow can't be drawn yet. Instead of rendering a
  collapsed/garbage line, it draws nothing and **auto-redraws the moment the
  anchor is revealed** (via `IntersectionObserver`). For full control — or for
  engines without `IntersectionObserver` — call `arrow.refresh()` from your
  tab/accordion show handler:

  ```ts
  const arrow = scrollArrow({ start: '#a', end: '#tab-2-target' });

  tabButton.addEventListener('click', () => {
    showTabPanel(2); // your code reveals the panel
    arrow.refresh(); // recompute now that the anchor has a box
  });
  ```

- **Manual mode** — `scroll: false` + `setProgress(0..1)` to drive it yourself
  (e.g. from GSAP/Motion).
- **Reduced motion** — arrows auto-respect `prefers-reduced-motion: reduce`,
  rendering fully drawn and static (no scroll animation) while still tracking
  layout. Opt out with `respectReducedMotion: false` to keep the animation.
  Works the same for `scrollArrowGroup`.
- **Labels** — `label` rides along the line at `labelAt` (0..1, default mid)
  and can sit off the line via `labelOffset` (perpendicular px; + = left of the
  draw direction, − = right). Fades in as the pen draws through it.
  `labelBackground` masks a gap in the line behind the text (the excalidraw
  look); style via `labelColor` / `font`.
- **Staggered groups** — `scrollArrowGroup` owns N arrows and reveals them in
  sequence off one shared trigger (`A then B then C`). `stagger` (0..1) controls
  overlap: `1` draws each in its own slice, `0` draws them together.

## Groups (staggered reveal)

For diagrams (org/family trees, flows) where a set of arrows should draw in
order rather than each on its own scroll, use a group. It creates the arrows in
manual mode and drives their progress as one coordinated reveal.

```ts
import { scrollArrowGroup } from 'scroll-arrows';

const group = scrollArrowGroup({
  arrows: [
    { start: '#a', end: '#b', roughness: 0.6 },
    { start: '#b', end: '#c', roughness: 0.6 },
    { start: '#b', end: '#d', roughness: 0.6 },
  ],
  stagger: 1, // 0 = all together, 1 = fully sequential (default)
  scroll: { target: '#diagram' }, // shared trigger; defaults to all endpoints
});

// later
group.destroy();
```

Each entry takes the usual per-arrow options. The group forces `scroll: false`
on each arrow and slices its own progress across them. Pass `scroll: false` to
drive the whole group yourself with `group.setProgress(0..1)`; `group.refresh()`
recomputes every arrow's geometry. The default `scroll.target` is a synthetic
rect spanning every endpoint, so the group reveals as it scrolls into view.

## React

```tsx
import { useRef } from 'react';
import { ScrollArrowLine } from 'scroll-arrows/react';

function Diagram() {
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={a}>A</div>
      <div ref={b}>B</div>
      <ScrollArrowLine start={a} end={b} roughness={0.6} />
    </>
  );
}
```

`ScrollArrowLine` renders nothing into the React tree — it manages the overlay
arrow via effect and cleans up on unmount. `useScrollArrow(opts)` is the hook
form. Pass `deps={[...]}` to re-create when inputs change.

For a staggered group, `ScrollArrowGroupLines` (and the `useScrollArrowGroup`
hook) take an `arrows` array whose `start`/`end` accept refs:

```tsx
<ScrollArrowGroupLines
  arrows={[
    { start: a, end: b },
    { start: b, end: c },
  ]}
  stagger={1}
/>
```

## Astro

The core is DOM-only, so run it in a client script (it must execute in the
browser, not at build time):

```astro
---
// Diagram.astro
---
<div id="a">A</div>
<div id="b">B</div>

<script>
  import { scrollArrow } from "scroll-arrows";
  scrollArrow({ start: "#a", end: "#b", roughness: 0.6 });
</script>
```

For an Astro React island, use the React API and hydrate with `client:visible`:

```astro
<Diagram client:visible />
```

## SSR & progressive enhancement

scroll-arrows is **progressive-enhancement only by design**. The arrow is an
overlay `<svg>` created by the client script at runtime — there is no
server-rendered or build-time output. In SSG/SSR setups (Astro, Next, etc.) the
connector simply does not exist until the script runs, so:

- **No-JS / pre-hydration users see nothing** where an arrow would be. Arrows
  are treated as decorative enhancement, not content.
- Don't encode meaning solely in an arrow. If a relationship must survive without
  JS (accessibility, SEO, no-JS fallback), express it in the DOM too — adjacent
  copy, a list, a caption, an `aria-label` — and let the arrow decorate it.
- The library ships no static snapshot. Geometry depends on the live, laid-out
  positions of both anchors (and the viewport), which aren't known at build time,
  so a server-rendered arrow would usually be wrong anyway.

If you genuinely need a static connector in the un-hydrated state, hand-author a
plain `<svg>` in your markup and let scroll-arrows draw over it on hydration —
the runtime arrow mounts in its own overlay and won't clash with your static one.

## API

`scrollArrow(options)` / `new ScrollArrow(options)` → instance with
`setProgress(p)`, `refresh()`, `destroy()`.

Key options: `start`, `end`, `container`, `roughness`, `stroke`, `strokeWidth`,
`seed`, `startSocket`, `endSocket`, `curvature`, `head`, `headSize`, `scroll`,
`speed`, `easing`, `progress`. Full types ship with the package.

## Develop

```bash
npm run demo       # vite playground at /demo
npm test           # vitest (library + release tooling)
npm run coverage   # vitest + v8 coverage (pure logic gated at 90%)
npm run build      # tsup → dist (ESM + CJS + d.ts)
```

## Releasing

Automated **staging → main** flow (semver, derived from conventional-commit PR
titles):

1. Feature PRs merge into `staging`.
2. `auto-release-pr.yml` keeps a single **"Release: staging to main"** PR open,
   its body a categorized summary (Features / Fixes / Docs / Maintenance) plus
   the proposed next version (`feat:` → minor, `fix:`/other → patch, `!` or
   `BREAKING CHANGE` → major).
3. Merging that PR to `main` triggers `release-changelog.yml`: it computes the
   version from the newest `v*` tag, bumps `package.json` + prepends a
   `CHANGELOG.md` entry on a `release-<version>` branch, tags `v<version>`, and
   opens a sync PR back to `staging`.
4. `release-changelog.yml` then dispatches `release.yml` via `workflow_dispatch`
   (a tag pushed under `GITHUB_TOKEN` cannot trigger `on: push: tags` — GitHub's
   anti-recursion guard), passing the tag. `release.yml` publishes to npm via
   **trusted publishing (OIDC)** with provenance (version pinned to the tag). A
   `v*` tag pushed manually with your own credentials also triggers `release.yml`
   directly via `on: push: tags`.

Release logic lives in `scripts/*.mjs` (pure helpers + injectable-deps
orchestrators), unit-tested under vitest.

Publishing uses OIDC — no `NPM_TOKEN` secret. One-time bootstrap (npm requires
the package to exist before a trusted publisher can be configured):

1. `npm login` then `npm publish --access public` once from your machine.
2. On npmjs.com → the package → Settings → **Trusted Publishing**, add the
   GitHub Actions publisher (`dancj/scroll-arrows`, workflow `release.yml`).

After that, every `v*` tag publishes from CI with no stored credentials.

[rough.js]: https://roughjs.com
