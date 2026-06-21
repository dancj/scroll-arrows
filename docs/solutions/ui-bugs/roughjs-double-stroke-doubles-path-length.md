---
title: "rough.js double stroke doubles getTotalLength, halving labelAt placement"
date: 2026-06-21
category: ui-bugs
module: scroll-arrow label placement
problem_type: ui_bug
component: tooling
symptoms:
  - "A label at labelAt 0.22 rendered near the curve's apex (~44%), not at 22%"
  - "labelAt 0.5 rendered at the endpoint instead of the midpoint"
  - "'start' and 'end' looked correct by coincidence, masking the bug"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [roughjs, svg, gettotallength, getpointatlength, label, double-stroke]
---

# rough.js double stroke doubles getTotalLength, halving labelAt placement

## Problem

Labels positioned a fraction along an arrow (`labelAt`) landed at roughly twice
their intended fraction. `labelAt: '22%'` sat near the apex of an obstacle-avoidance
curve; `labelAt: 0.5` sat at the endpoint. The placement measured against the
rendered rough.js stroke instead of the smooth ideal path.

## Symptoms

- `labelAt: 0.22` (or `'22%'`) rendered the label near the curve apex (~44% along), not at 22%.
- `labelAt: 0.5` rendered at the endpoint, not the midpoint.
- `'start'` (0) and `'end'` (1) looked right by luck — both passes share those endpoints — which hid the bug.

## What Didn't Work

- Suspecting `resolveLabelAt()` (the keyword/percentage parser). It was correct: `'22%'` → `0.22`, verified by unit tests. The fraction was right; what it multiplied against was wrong.
- Suspecting a divergence between the demo's displayed code card and the actual `scrollArrow()` call. They share one `opts` object — no divergence.

## Solution

Measure label position against the **smooth ideal path** (`d` string passed to
rough.js), not the rendered rough stroke. Build a throwaway invisible `<path>`,
sample it, remove it.

Before — measured the rough stroke (`this.lineEl`):

```ts
const total = this.lineEl.getTotalLength();
const at = resolveLabelAt(this.opts.labelAt);
const pt = this.lineEl.getPointAtLength(at * total);
```

After — measure the smooth path stored at build time (`this.lineD`):

```ts
// render(): remember the smooth path before handing it to rough.js
this.lineD = d;
this.appendDrawable(this.rc.path(d, roughOpts), 'line');

// renderLabel(): sample an invisible measuring path, then discard it
const measure = createSvgEl('path');
measure.setAttribute('d', this.lineD);
this.group.appendChild(measure);
const total = measure.getTotalLength();
const pt = measure.getPointAtLength(at * total);
// ...sample before/after for the perpendicular offset...
this.group.removeChild(measure);
```

## Why This Works

With default options, rough.js draws every stroke **twice** (the sketchy
"double stroke") and bakes both passes into a **single `<path>` whose `d` has
two `M` subpaths**. Confirmed against the bundled generator:

```js
import rough from 'roughjs';
const gen = rough.generator();
const drawable = gen.path('M 0 0 C 100 -80 300 -80 400 0', { roughness: 0.5, seed: 42 });
const sets = gen.toPaths(drawable);
// sets.length === 1, and that single path's d contains 2 "M" commands
```

So `roughPath.getTotalLength()` is ~2× the visible curve length. Sampling
`getPointAtLength(at * total)` therefore lands at ~`2*at` along the first
visible pass: `0.22 → ~44%`, `0.5 → the endpoint` (end of pass 1). The smooth
`d` is a single pass, so sampling it restores the intended fraction.

Note the code already assumed "1-2 overlapping strokes" but treated them as
**separate `<path>` elements** (picking the longest as the representative line).
rough.js actually returns **one element with two subpaths**, so the "longest"
path already contained both passes.

## Prevention

- Never measure semantic geometry (label anchors, midpoints, fractions-along) against a rough.js-rendered path. Keep the pre-roughened `d` string and sample a throwaway path built from it.
- When a fraction-along-a-path result looks like it's at `2×` the expected position, suspect a doubled length source (double stroke, concatenated subpaths) before suspecting the fraction math.
- Spot-check `labelAt: 0.5` during any change to path building — it must sit at the visual midpoint, not the endpoint. It is the cheapest regression probe for this class of bug.

## Related Issues

- Sibling bug, same edge: an **end-anchored label was never visible**. `labelOpacity` ramped opacity over `[labelAt, labelAt + fade]`, but `lineProgress` tops out at 1, so `labelAt: 1` (e.g. `'end'` on a right-to-left arrow) computed `(1 - 1) / fade = 0` and stayed invisible. Fix: clamp the ramp **start** to `1 - fade` so the window always fits within `[0, 1]`; interior labels keep their trailing fade unchanged. Same lesson as the position bug — `labelAt` at the `0`/`1` extremes is where label code breaks, so probe both.
- Known remaining gap: label fade-in timing still keys off the rough-stroke draw progress (the doubled length), so a label can fade in slightly out of sync with the pen's visual position mid-draw. Endpoint visibility and final placement are correct; this residual timing skew is a subtler concern left as-is.
- Not unit-testable under jsdom — it has no SVG path geometry (`getTotalLength`/`getPointAtLength`). The pure helpers (`resolveLabelAt`, `labelOpacity`) are unit-tested; the geometry wiring is verified manually in a browser.
