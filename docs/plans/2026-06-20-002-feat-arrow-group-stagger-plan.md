---
title: 'feat: Staggered multi-arrow group / timeline (#19)'
type: feat
date: 2026-06-20
status: implemented
depth: standard
origin: GitHub issue #19
---

# feat: Staggered multi-arrow group / timeline (#19)

## Summary

Add a first-class `ScrollArrowGroup` primitive that owns N arrows and reveals
them in a staggered sequence (`A then B then C`) off **one shared scroll
trigger**, instead of each arrow drawing on its own scroll progress. Resolves
issue #19 and the coupled shared-trigger gap it mentions.

## Problem Frame

Each `ScrollArrow` drives its own progress from its own (or a per-arrow)
scroll target. Real diagrams (org/family trees, flows) want a coordinated set
that draws in order. Today that requires `scroll: false` + a hand-rolled rAF
timeline calling `setProgress()` across N instances.

## Key Technical Decisions

**KTD1 — Group primitive over a per-arrow `delay`.** Chosen API (confirmed with
the author): `scrollArrowGroup({ arrows, stagger, scroll })`. The group creates
each arrow with `scroll: false`, binds a single scroll/resize listener, and
slices its own 0..1 progress across the arrows. This solves the stagger _and_
the shared-trigger gap with no churn to the single-arrow API.

**KTD2 — `stagger` 0..1 maps to slice overlap.** Pure helper `staggerWindows(n,
stagger)` returns one `{start, span}` window per arrow such that the spans are
equal, starts increase, and the last window always ends at exactly 1. `stagger
= 1` → non-overlapping equal slices (sequential); `stagger = 0` → every window
is `[0,1]` (simultaneous). `windowProgress(p, w)` maps group progress into a
window's local 0..1. Both are pure and unit-tested.

**KTD3 — Default trigger = union of all endpoints.** When `scroll.target` is
omitted, the group builds a synthetic rect spanning every arrow's start/end so
it reveals as the diagram scrolls into view. `scrollProgress` already keys off
`rect.top`, reused as-is.

## Scope

In scope: `src/group.ts` (class + pure window math), exports in `src/index.ts`
(`ScrollArrowGroup`, `scrollArrowGroup`, `ScrollArrowGroupOptions`), types in
`src/types.ts`, React parity (`useScrollArrowGroup`, `ScrollArrowGroupLines`),
tests, README.

Non-goals: per-arrow `delay` knob; a full GSAP-style timeline with keyframes;
changing single-arrow scroll behavior.

## Implementation Units

- **U1 Pure stagger math** — `staggerWindows` / `windowProgress` in `group.ts`.
  Tested in `test/group.test.ts` (tiling, overlap, clamping, zero-span edge).
- **U2 `ScrollArrowGroup`** — owns sub-arrows (`scroll: false`), one rAF-gated
  scroll listener, `setProgress` / `refresh` / `destroy`, default group rect.
- **U3 Exports + types** — factory + named exports; `ScrollArrowGroupOptions`.
- **U4 React** — `useScrollArrowGroup` + `ScrollArrowGroupLines` resolving
  ref/element/selector anchors per arrow.
- **U5 Docs** — README "Groups" section + React group snippet.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run test` (98 tests), `npm run
build` all pass. Pure math covered by unit tests; the class is a thin
  orchestrator over the already-tested `ScrollArrow` + `scrollProgress`.
