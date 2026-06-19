# scroll-arrows

[![CI](https://github.com/dancj/scroll-arrows/actions/workflows/ci.yml/badge.svg)](https://github.com/dancj/scroll-arrows/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/scroll-arrows.svg)](https://www.npmjs.com/package/scroll-arrows)
[![bundle size](https://img.shields.io/bundlejs/size/scroll-arrows)](https://bundlejs.com/?q=scroll-arrows)
[![license](https://img.shields.io/github/license/dancj/scroll-arrows.svg)](./LICENSE)

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
- **Manual mode** — `scroll: false` + `setProgress(0..1)` to drive it yourself
  (e.g. from GSAP/Motion).
- **Labels** — `label` rides along the line at `labelAt` (0..1, default mid)
  and can sit off the line via `labelOffset` (perpendicular px; + = left of the
  draw direction, − = right). Fades in as the pen draws through it.
  `labelBackground` masks a gap in the line behind the text (the excalidraw
  look); style via `labelColor` / `font`.

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
4. The pushed `v*` tag triggers `release.yml`, publishing to npm via
   **trusted publishing (OIDC)** with provenance (version pinned to the tag).

Release logic lives in `scripts/*.mjs` (pure helpers + injectable-deps
orchestrators), unit-tested under vitest.

Publishing uses OIDC — no `NPM_TOKEN` secret. One-time bootstrap (npm requires
the package to exist before a trusted publisher can be configured):

1. `npm login` then `npm publish --access public` once from your machine.
2. On npmjs.com → the package → Settings → **Trusted Publishing**, add the
   GitHub Actions publisher (`dancj/scroll-arrows`, workflow `release.yml`).

After that, every `v*` tag publishes from CI with no stored credentials.

[rough.js]: https://roughjs.com
