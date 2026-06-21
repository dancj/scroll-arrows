---
title: 'feat: per-arrow socket offset for shared-origin fan-out'
type: feat
date: 2026-06-20
status: planned
origin: GitHub issue #24
---

# feat: socket offset (shared-origin fan-out)

## Summary

When several arrows leave the same element, each resolves its `auto` socket
independently and they all land on the same edge point — stacking/overlapping.
Add a per-arrow `startSocketOffset` / `endSocketOffset` (a fraction of the edge
length) that slides the attach point along its edge, so callers can fan a set of
sibling arrows out across a shared edge.

This is the per-arrow-offset option the issue offers as a valid resolution.
Automatic fan-out (the library detecting shared anchors and spreading them) is a
larger cross-arrow-coordination feature deferred to follow-up; this primitive is
what enables it.

## Requirements

- **R1** — `startSocketOffset` / `endSocketOffset` slide the respective attach
  point along its resolved edge as a fraction of the edge length (`0` centered,
  `±0.5` corners). Default `0` (unchanged behavior).
- **R2** — Offsets are clamped to `[-0.5, 0.5]` so the point stays on the edge.
- **R3** — Works for all edges (top/bottom slide on x, left/right slide on y) and
  with both `auto` and forced sockets.
- **R4** — Passes through `scrollArrowGroup` (group spreads per-arrow options to
  each child arrow).

## Key Technical Decisions

- **KTD1 — Offset is a fraction of edge length, not px.** Resolution-independent
  and intuitive for fan-out (`-0.25, 0, +0.25` for three siblings). Clamped so
  it never leaves the edge.
- **KTD2 — Lives in pure geometry.** `socketPoint(r, side, offset)` and a
  threaded `resolveEndpoints(..., startOffset, endOffset)` keep it pure and unit
  testable; `scroll-arrow.ts` just forwards the options.
- **KTD3 — Per-arrow manual offset over auto-distribution.** Auto fan-out needs a
  registry of arrows sharing an anchor and same-side detection — fuzzy and
  cross-instance. The manual offset is bounded, correct, and composes with the
  group; auto-distribution is deferred.

## Implementation Units

### U1. Socket offset in geometry

- **Goal:** Slide the attach point along its edge.
- **Requirements:** R1, R2, R3
- **Files:** `src/geometry.ts`, `test/geometry.test.ts`
- **Approach:** `socketPoint(r, side, offset = 0)` clamps to `[-0.5, 0.5]` and
  shifts along the edge axis (x for top/bottom, y for left/right).
  `resolveEndpoints` gains `startOffset`/`endOffset` params (default 0) threaded
  to each `socketPoint`.
- **Test scenarios:** horizontal-edge slide; vertical-edge slide; clamp beyond
  `±0.5` → corner; three-arrow fan-out spread across one edge; default (no
  offset) unchanged (covered by existing tests).

### U2. Forward options through ScrollArrow

- **Goal:** Expose the option.
- **Requirements:** R1, R4
- **Dependencies:** U1
- **Files:** `src/types.ts`, `src/scroll-arrow.ts`
- **Approach:** Add `startSocketOffset?` / `endSocketOffset?` to
  `ScrollArrowOptions`; `computeEndpoints` forwards `?? 0` to `resolveEndpoints`.
  Group already spreads per-arrow options, so fan-out works inside a group with
  no group-specific code.
- **Test scenarios:** `Test expectation: none -- thin option forwarding; geometry covered in U1, integration via demo.`

### U3. Docs + demo

- **Goal:** Document fan-out; show it in the tree demo.
- **Requirements:** R1
- **Dependencies:** U2
- **Files:** `README.md`, `demo/index.html`
- **Approach:** "Shared-origin fan-out" bullet + key-options entry. Spread the
  existing root→A/B/C group demo (which currently stacks on the root's bottom
  edge) with `startSocketOffset: -0.3 / 0 / 0.3`.
- **Test scenarios:** `Test expectation: none -- docs/demo only.`

## Scope Boundaries

Deferred to follow-up: automatic distribution of shared-anchor arrows (library
detecting and spreading them without explicit offsets).

## Verification

- `npm run test`, `typecheck`, `lint`, `coverage` (gate), `build` all green.
