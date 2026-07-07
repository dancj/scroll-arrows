---
title: 'feat: Solid (filled) arrowhead style + start-head render coverage'
date: 2026-07-06
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
origin: 'GitHub issues #60 and #61'
---

# feat: Solid (filled) arrowhead style + start-head render coverage

## Summary

Two issues, one branch/PR:

- **#60** — add `headStyle?: 'line' | 'solid'` (default `'line'`, non-breaking). `'solid'` closes the head path (`… L p2 Z`) and fills it with the stroke color via rough.js `fill` + `fillStyle: 'solid'`, keeping the hand-drawn look. Applies to start and end heads. Filled heads can't dash-reveal, so they fade in during their slot of the draw-on sequence.
- **#61** — render-level tests for `head: 'start'` alone, which today is only exercised via `'both'`; a bug isolated to the `head === 'start'` disjunct in `src/scroll-arrow.ts` would not be caught.

**Branch/PR convention:** branch from `origin/staging`; PR targets `staging`; closes #60 and #61.

---

## Assumptions

- Single branch and single PR covering both issues (they share `test/scroll-arrow.test.ts`; #61's coverage also protects the render path #60 modifies). The request said "PR for both" — read as one PR resolving both.
- Fade-in (opacity ramp) is the accepted draw-on treatment for solid heads; no scale animation (issue offers "fade/scale" — fade is simpler and sufficient).
- No demo-page changes; deferred (see Scope Boundaries).

---

## Problem Frame

`arrowHeadPath()` in `src/geometry.ts` always emits an open V (`M p1 L tip L p2`) and `mapRoughness()` hardcodes `fill: 'none'`. `appendDrawable()` in `src/scroll-arrow.ts` additionally force-sets `fill="none"` on every rough.js output path, and the draw-on animation (`src/draw.ts` `dashOffsets`) reveals every segment by `stroke-dashoffset` — a filled polygon has no stroke length to reveal. So a solid head needs: a closed geometry path, fill-carrying rough options for head drawables only, an `appendDrawable` that preserves rough.js fill paths, and an opacity-based reveal for fill segments.

Test gap (#61): `test/scroll-arrow.test.ts` exercises `head: 'none' | 'end' | 'both'` at render level; `hasStartHead` is only ever true co-occurring with `hasEndHead`.

## Requirements

- **R1**: `headStyle: 'solid'` renders each drawn head as a closed triangle filled with the stroke color, hand-drawn look preserved (rough.js `fillStyle: 'solid'`).
- **R2**: Default (`headStyle` omitted or `'line'`) output is byte-identical to today — no breaking change.
- **R3**: Solid style applies to whichever heads `head` selects (`'start'`, `'end'`, `'both'`).
- **R4**: Draw-on animation: solid heads appear only after the line completes, fading in over their slot; sequencing with multiple heads stays sensible. Reduced motion / `progress: 1` shows them fully.
- **R5**: Heads stay anchored at the true socket points; shaft inset behavior from #59 is unchanged (base inset math is identical for both styles).
- **R6** (#61): Render tests exercise `head: 'start'` alone — curve inset, start-head anchoring, and elbow startTrim wiring.

---

## Key Technical Decisions

- **KTD1 — Closed head path via a flag on the existing helper.** Extend `arrowHeadPath(tip, dir, size, closed = false)` to append `Z` when closed, rather than a parallel function — the three points are identical.
- **KTD2 — Fill options built per-head at render time.** `mapRoughness` stays as-is (`fill: 'none'` is right for the line). In `render()`, solid heads pass `{ ...roughOpts, fill: this.stroke, fillStyle: 'solid' }` to `rc.path`. No change to the roughness mapping contract.
- **KTD3 — Delete the redundant fill clobber in `appendDrawable`.** rough.js already emits `fill="none"` on every stroke path itself (roughjs `svg.js` `path` case), so the `el.setAttribute('fill', 'none')` line in `appendDrawable` is redundant today. Delete it — byte-identical for line/line-style output, and it automatically preserves the fill `<path>` rough.js emits for solid heads.
- **KTD4 — Fill segments reveal by opacity, tied to their head's stroke slot.** rough.js emits the fill path _before_ the stroke path(s) for filled shapes, so raw segment order cannot drive sequential reveal. Extend the segment model with a fill marker (e.g. `kind: 'head'` + `fill: true`) and group segments per head: a solid head's fill segment contributes **zero** length to the total draw budget, and its `opacity` equals its own head's stroke-segment reveal fraction (0 until that head's outline starts, 1 when it completes). Stroke segments keep dash-offset reveal unchanged; initial state for fill segments is opacity 0 (no dasharray).
- **KTD5 — Reveal is concurrent per head: outline dash-draws while the fill fades over the same slot.** This is the committed visual (the issue's "fade it in once the line completes"). Timing vs line-style heads differs slightly regardless — a closed triangle's outline is longer than the open V — and the fill adds no further length by KTD4; accepted.

## High-Level Technical Design

```
render():
  headOpts = headStyle === 'solid'
               ? { ...roughOpts, fill: stroke, fillStyle: 'solid' }
               : roughOpts
  headD    = arrowHeadPath(tip, dir, size, headStyle === 'solid')  // + Z when solid
  appendDrawable(rc.path(headD, headOpts), 'head')                 // keeps rough fill paths

applyProgress():
  fractions = per-segment revealed fraction (line shares leading edge; heads sequential;
              fill segments carry zero length and inherit their head's stroke fraction)
  stroke segment -> strokeDashoffset = len * (1 - fraction)
  fill segment   -> style.opacity   = fraction of its head group's stroke reveal
```

---

## Implementation Units

### U1. Render tests for head:'start' alone (#61)

**Goal:** Close the `head: 'start'` render-level coverage gap before touching the head code path.
**Requirements:** R6.
**Dependencies:** none.
**Files:** `test/scroll-arrow.test.ts`.
**Approach:** Mirror the existing #59 suite cases using its `anchors()`/`pathDs` helpers and SVG stubs.
**Patterns to follow:** `ScrollArrow shaft/head junction (#59)` describe block.
**Test scenarios:**

- Curve inset: line `d` for `{seed: 7, head: 'none'}` differs from `{seed: 7, head: 'start'}` (start inset along the start normal).
- Anchoring: with `head: 'start'`, the head path still contains the true start-socket coordinates (`anchors()` start socket resolves to `(100, 20)` — assert like the existing R3 regex).
- Elbow startTrim: `{route: 'elbow', head: 'start'}` line `d` differs from `{route: 'elbow', head: 'none'}`.
  **Verification:** `npm test` green; deleting the `head === 'start'` disjunct at `src/scroll-arrow.ts` `hasStartHead` would fail these tests.

### U2. Closed head path in geometry

**Goal:** `arrowHeadPath` can emit a closed triangle.
**Requirements:** R1 (geometry half).
**Dependencies:** none.
**Files:** `src/geometry.ts`, `test/geometry.test.ts`.
**Approach:** KTD1 — optional `closed` param appends ` Z`.
**Test scenarios:**

- `closed: true` output ends with `Z` and shares the same three points as the open form.
- Default/omitted stays exactly the current string (R2 guard at geometry level).
  **Verification:** geometry tests green.

### U3. `headStyle` option and solid-head rendering

**Goal:** Public `headStyle` option; solid heads render filled.
**Requirements:** R1, R2, R3, R5.
**Dependencies:** U2.
**Files:** `src/types.ts`, `src/scroll-arrow.ts`, `test/scroll-arrow.test.ts`.
**Approach:** Add `HeadStyle` type + `headStyle?: 'line' | 'solid'` to `ScrollArrowOptions` (doc comment per existing style). In `render()`, per KTD2 build head-specific rough options and pass `closed` to `arrowHeadPath`. Fix `appendDrawable` per KTD3.
**Test scenarios:**

- `headStyle: 'solid', head: 'end'`: at least one head path carries a non-`none` fill equal to the stroke color, and its `d` passes through the true socket coordinates (same regex style as the existing R3 test). Do not assert `Z` in the rendered `d` — rough.js re-emits paths through `opsToPath`, which only produces M/L/C commands; the closing `Z` is observable only at the geometry level (U2).
- Default omitted vs explicit `'line'`: rendered `d` strings and fill attributes identical to a render with no `headStyle` (R2).
- `head: 'both', headStyle: 'solid'`: both heads filled.
- Line paths always keep `fill="none"` regardless of `headStyle`.
  **Verification:** `npm test`, `npm run typecheck`, `npm run lint` green.

### U4. Draw-on reveal for filled heads

**Goal:** Solid heads fade in during their slot instead of dash-revealing.
**Requirements:** R4.
**Dependencies:** U3.
**Files:** `src/draw.ts`, `src/scroll-arrow.ts`, `test/draw.test.ts`.
**Approach:** KTD4/KTD5 — mark fill segments and group them with their head's stroke segments; compute per-segment revealed fraction in `draw.ts` (pure, unit-testable) with fill segments contributing zero length and inheriting their head group's stroke fraction; `applyProgress` maps fraction → dashoffset for stroke segments, → opacity for fill segments; initial state sets fill-segment opacity 0 and skips dasharray on them.
**Test scenarios (pure, in `test/draw.test.ts`):**

- Fill segment fraction is 0 while the line is still drawing.
- Fill segment fraction equals its head group's stroke fraction as that head reveals (concurrent outline + fade), reaching 1 when the head completes.
- Fill segment length does not shift the total draw budget (line completes at the same eased progress with and without a fill segment of the same head).
- Fraction is 1 at eased progress 1 (reduced-motion/static case).
- Stroke segments' offsets unchanged from current `dashOffsets` behavior for the same inputs (R2 guard on animation).
  **Verification:** `npm test` green; manual demo check deferred to browser-test step of the pipeline.

### U5. Document the option

**Goal:** README documents `headStyle`.
**Requirements:** R1 (discoverability).
**Dependencies:** U3.
**Files:** `README.md`.
**Approach:** Add `headStyle` next to the existing `head`/`headSize` entries (options block near line 40 and the options list near line 240).
**Test expectation:** none — docs only.
**Verification:** `npm run format:check` green.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- Demo-page toggle showcasing `headStyle: 'solid'`.
- Group-level (`ScrollArrowGroupOptions`) needs nothing: per-arrow options already pass through.

### Non-goals

- Other head shapes (dot, bar, diamond).
- Per-end head styles (`startHeadStyle`/`endHeadStyle`) — one knob for both ends, per issue.
- Scale-in animation for solid heads.

---

## Verification Contract

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` all green.
- R2 regression guard: renders without `headStyle` produce identical DOM output to pre-change (covered by seed-deterministic `d`-string tests in U2/U3/U4).

## Definition of Done

- All five units landed; issues #60 and #61 requirements covered by passing tests.
- PR open against `staging` referencing both issues.
