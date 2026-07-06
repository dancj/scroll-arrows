---
title: "fix: Stop shaft overlapping the arrowhead"
date: 2026-07-06
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
origin: "GitHub issue #59"
---

# fix: Stop shaft overlapping the arrowhead

## Summary

The shaft path and the arrowhead share the same endpoint, so the line (plus rough.js wobble) visibly crosses the arrowhead's V instead of meeting it at the base. Fix: when a head is drawn at an end, shorten the shaft by the head's base depth — pulling the endpoint back along the arrival tangent (curve route) or trimming the first/last leg (elbow route) — while keeping the arrowhead itself anchored at the true socket point. Both ends, with clamps so very short arrows never invert.

**Branch/PR convention:** branch from `origin/staging`; PR targets `staging`.

---

## Problem Frame

In `src/scroll-arrow.ts` `render()`, `buildPath(local, …)` / `buildElbowPath(local)` end exactly at `local.end`, and the end head is `arrowHeadPath(local.end, dir, size)` — tip at the same point. The head's base sits `size * cos(spread)` behind the tip (`spread = π/7` in `src/geometry.ts` `arrowHeadPath`), so the shaft runs ~0.9 × headSize past where it should stop. Same at the start when `head` is `'start'` or `'both'`.

## Requirements

- **R1**: When `head` includes `'end'`, the shaft terminates at the arrowhead's base (tip minus base depth along the aim direction), not at the tip.
- **R2**: Same treatment for the start point when `head` includes `'start'`.
- **R3**: The arrowhead stays anchored at the true socket point — the tip still touches the target edge.
- **R4**: `head: 'none'` (and the non-headed end of `'start'`/`'end'`) renders exactly as today.
- **R5**: Both `route: 'curve'` (default, incl. obstacle avoidance) and `route: 'elbow'` get the inset.
- **R6**: Very short arrows degrade gracefully — insets never invert or collapse the shaft.
- **R7**: Draw-on animation ordering unchanged: head strokes still begin after the (now slightly shorter) line finishes.

---

## Key Technical Decisions

- **KTD1 — Inset lives in geometry as a pure function (curve route).** Add `insetEndpoints(ep, startInset, endInset): Endpoints` to `src/geometry.ts`. It moves `start`/`end` back along `startTangent(ep)`/`endTangent(ep)` (i.e. `p - tangent * inset`; note `endTangent` is `-endNormal` for side sockets, so this equals `end + endNormal * inset` — same formula, two spellings) and preserves the normals so `cubicControls` still bows the curve off the socket edges. Pure and unit-testable; `render()` just calls it.
- **KTD2 — Base depth derived from the shared spread constant.** Inset = `headSize * cos(π/7)` (~0.9 × headSize). Hoist the `spread` constant in `geometry.ts` so `arrowHeadPath` and the inset computation share one source of truth; no new public option (issue allows a fixed fraction).
- **KTD3 — Short-arrow clamp (curve route).** If `startInset + endInset` exceeds half the start→end chord length, scale both proportionally so the shaft keeps at least half the chord. Prevents inverted/degenerate paths for tiny arrows (R6). The chord comparison is exact only for facing-collinear sockets (elsewhere it is strictly conservative — it may shrink insets more than needed, which is safe); test it in that configuration.
- **KTD4 — Curve route gets inset endpoints; elbow route trims its legs.** For the curve route, `routeBellies` and `buildPath` receive the inset endpoints, so obstacle detection runs against the curve actually rendered. The elbow route must NOT receive inset endpoints — `buildElbowPath` recomputes corners from its endpoints, so a moved endpoint shifts the mid-rail by inset/2 and can invert the final leg entirely (e.g. start `(0,0)` right-socket → end `(200,5)` top-socket: inset end `(200,-7.6)` makes the last leg travel away from the target while the head points at it). Instead, build the elbow from the true endpoints and trim the first/last leg along its own axis by the inset, clamping each trim to that leg's length. This per-leg trim also handles center-socket elbows correctly (the trim follows the actual leg direction, not a tangent guess).
- **KTD5 — Head aim vs shaft arrival for center sockets (curve route).** Heads are aimed with tangents computed from the original `local` endpoints. For side sockets the tangents are the socket normals and are unaffected by insetting. For a zero-normal (center) socket the tangent falls back to the chord direction, so insetting the far endpoint rotates the shaft's true arrival by ~`atan(inset/chord)` relative to the head aim — a few degrees at typical sizes. Accepted: center sockets are already a fallback path.

## High-Level Technical Design

```
render():
  local  = shifted endpoints                     (true socket points)
  si/ei  = per-end insets from opts.head         (headSize * cos(π/7), or 0)
  dirs   = endTangent(local)/startTangent(local)
  d      = route === 'elbow'
             ? buildElbowPath(local, si, ei)     // true endpoints; first/last leg trimmed
             : buildPath(insetEndpoints(local, si, ei), curvature, ...routeBellies(...))
  heads  = arrowHeadPath(local.end, dirs.end, size)   // still at true tip
           arrowHeadPath(local.start, dirs.start, size)
```

Geometry of the end inset (side socket, curve route): travel arrives along `-endNormal`, so the shaft's new endpoint is `end + endNormal * inset` — back along the arrival path, exactly at the head's base midpoint. Elbow route: corners stay computed from true endpoints; only the first/last straight leg is shortened by the trim.

---

## Implementation Units

### U1. Geometry: `insetEndpoints`, elbow leg trims, shared spread constant

**Goal:** Pure inset/trim primitives with clamping.
**Requirements:** R1, R2, R5, R6 (geometry half), KTD1–KTD4.
**Dependencies:** none.
**Files:** `src/geometry.ts`, `test/geometry.test.ts`.
**Approach:** Hoist `spread = Math.PI / 7` to a module constant used by `arrowHeadPath`; export `headBaseInset(size)` (or equivalent) returning `size * Math.cos(spread)`. Add `insetEndpoints(ep, startInset, endInset)` (curve route) that computes tangents via existing `startTangent`/`endTangent`, applies the proportional clamp from KTD3, and returns a new `Endpoints` with moved points and original normals. Extend `buildElbowPath(ep, startTrim = 0, endTrim = 0)` (elbow route) to shorten the first/last straight leg along its own axis after corners are computed from the true endpoints, clamping each trim to its leg's length (KTD4). Follow existing pure-function style in `geometry.ts`.
**Patterns to follow:** `routeBellies` / `samplePath` doc-comment style; existing `Endpoints` shape; `buildElbowPath` branch structure.
**Test scenarios:**
- End inset, side socket: `insetEndpoints(ep, 0, k)` moves `end` by `+endNormal * k`, leaves `start` and normals untouched.
- Start inset, side socket: `start` moves by `+startNormal * k`.
- Both insets applied independently.
- Zero insets/trims: output identical to today (identity for `head: 'none'`).
- Center sockets (zero normals): inset falls back along the chord direction (matches `endTangent` fallback).
- Short chord clamp (facing-collinear sockets, where the comparison is exact): chord length 10, insets 12+12 → both scale so shaft length stays ≥ half the chord; endpoints never cross.
- Elbow end trim: corners unchanged (mid-rail/corner coordinates identical to untrimmed output); only the final leg's endpoint moves back along that leg by the trim.
- Elbow inversion guard: start `(0,0)` right-socket → end `(200,5)` top-socket with trim 12.6 (final leg length 5) — trim clamps to the leg length; the final leg never extends past its corner.
- Elbow same-axis sockets: mid-rail `midY`/`midX` identical with and without trims.
**Verification:** `vitest` geometry suite green; new cases cover each scenario.

### U2. Wire inset into `render()` for both routes

**Goal:** Shaft stops at the head base in the rendered SVG; heads stay at true sockets.
**Requirements:** R1–R5, R7, KTD4.
**Dependencies:** U1.
**Files:** `src/scroll-arrow.ts`, `test/scroll-arrow.test.ts`.
**Approach:** In `render()`, after computing `local`, derive per-end insets from `this.opts.head` and `headSize`. Curve route: build `shaft = insetEndpoints(local, si, ei)` and pass `shaft` to `routeBellies` + `buildPath`. Elbow route: pass the true `local` plus the insets as leg trims — `buildElbowPath(local, si, ei)`. Keep `arrowHeadPath(local.end, endTangent(local), size)` and the start-head call on `local` unchanged. `lineD` (label measurement) naturally uses the shortened path. No changes to `dashOffsets` / segment ordering.
**Patterns to follow:** existing `render()` structure; `shift()` local-coords idiom.
**Test scenarios:**
- Covers R1: `head: 'end'` — the line path's `d` terminates at the socket point pulled back by `headSize * cos(π/7)` along the end normal; head path still contains the true tip coordinates.
- Covers R2: `head: 'both'` — start of line `d` inset along the start normal; both heads at true sockets.
- Covers R4: `head: 'none'` — line `d` endpoints equal the socket points exactly (byte-compare against pre-change expectation).
- Covers R5: `route: 'elbow'` with `head: 'end'` — final `L` coordinate pulled back along the final leg's axis; corner coordinates unchanged from the untrimmed elbow.
- Covers R7: segments still ordered line-then-head; existing `draw.test.ts` ordering tests pass unchanged.
- Label still renders on a labelled arrow (shortened `lineD` doesn't break `renderLabel`).
**Verification:** full `vitest` suite green; visual spot-check in demo page shows shaft meeting head base cleanly.

---

## Scope Boundaries

**In scope:** shaft/head junction geometry for curve and elbow routes, both ends.

**Out of scope (true non-goals):** rough.js wobble/overshoot tuning; changing arrowhead shape or spread.

### Deferred to Follow-Up Work
- Solid/filled arrowhead type — tracked as issue #60.
- Head-aim vs shaft-arrival divergence for center-socket curve arrows (KTD5) — accepted, revisit only if visible in practice.

## Risks & Dependencies

- **Snapshot-ish tests:** existing tests asserting exact path `d` strings for headed arrows will need updating — expected, not a regression.
- **rough.js overshoot:** wobble can still poke a stroke slightly past the shaft end; issue accepts this (the fix removes the systematic full-tip overlap).

## Verification Contract

- `npx vitest run` green (geometry, scroll-arrow, draw, reduced-motion suites).
- Lint/typecheck clean (`eslint`, `tsc`).

## Definition of Done

- R1–R7 hold, demonstrated by the U1/U2 test scenarios.
- All existing tests pass (updated only where they encoded the old overlapping endpoint).
- No public API change.
