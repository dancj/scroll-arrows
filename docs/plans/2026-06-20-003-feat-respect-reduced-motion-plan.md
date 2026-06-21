---
title: 'feat: Respect prefers-reduced-motion (static fully-drawn fallback)'
type: feat
date: 2026-06-20
status: planned
origin: GitHub issue #20
depth: lightweight
---

# feat: Respect prefers-reduced-motion (static fully-drawn fallback)

## Summary

`scroll-arrows` animates a stroke as the user scrolls — a decorative motion
effect. It currently has no `prefers-reduced-motion` awareness, so users who
have asked the OS to reduce motion still get the scroll-driven draw-on
animation. Decorative-animation libraries are expected to honor this media
query for accessibility.

This plan adds automatic `prefers-reduced-motion: reduce` support: when the
user prefers reduced motion, an arrow (and a group) renders **fully drawn and
static** — no scroll listeners, no progressive draw — while still tracking
layout via `ResizeObserver`. A `respectReducedMotion` opt-out flag (default
`true`) lets callers disable the behavior.

Scope: `ScrollArrow` and `ScrollArrowGroup` plus a small pure detection helper.
No change to geometry, roughness, or label rendering.

---

## Problem Frame

From GitHub issue #20:

> The API has no `prefers-reduced-motion` awareness. Callers must DIY: detect
> the media query, then `scroll: false` + `progress: 1` to render a static
> drawn arrow.
>
> **Ask:** auto-respect `prefers-reduced-motion: reduce` by default (render
> fully drawn, no scroll animation), or expose a `respectReducedMotion` flag.

The existing manual workaround (`scroll: false` + `progress: 1`) proves the
desired end state is already reachable; the gap is that it is not automatic and
forces every caller to wire the media query themselves.

---

## Requirements

- **R1** — When `prefers-reduced-motion: reduce` matches, an arrow renders
  fully drawn (equivalent to `progress: 1`) and runs no scroll-driven
  animation. (issue #20)
- **R2** — Behavior is on by default and can be disabled per-instance via
  `respectReducedMotion: false`, which restores today's scroll animation. (issue #20)
- **R3** — `ScrollArrowGroup` honors the same behavior: under reduced motion all
  arrows render fully drawn, no group scroll listener. (parity with #20)
- **R4** — Detection degrades safely where `matchMedia` is absent (SSR,
  older/headless environments): treat as "no preference" and animate normally.
- **R5** — `ResizeObserver` layout tracking is unaffected — a reduced-motion
  arrow still re-renders correctly when its anchors move or resize.

---

## Key Technical Decisions

- **KTD1 — Detect via a pure helper in `src/progress.ts`.** Add a small
  `prefersReducedMotion(): boolean` that wraps
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches` behind a
  guard for missing `window`/`matchMedia`. `progress.ts` is already the home
  for pure, unit-tested logic and is included in coverage, so the helper is
  directly testable by stubbing `matchMedia`. Avoids excluding more code from
  the coverage gate.
- **KTD2 — Reduced motion is modeled as "force progress 1 + disable scroll",
  reusing existing paths.** Rather than a new render branch, set
  `this.progress = 1` and treat the instance as if `scroll === false` for
  binding/update purposes. This reuses the already-correct static path
  (`scroll: false` + `progress: 1`) the issue itself describes, keeping the
  change minimal and behavior identical to the documented manual workaround.
- **KTD3 — Evaluated once at construction.** The preference is read in the
  constructor, not subscribed to live. A live `matchMedia` change listener is
  out of scope (deferred) — the common case is a stable OS setting at page
  load, and `refresh()` already re-renders if a caller needs to re-evaluate.
- **KTD4 — Default `true` (auto-respect).** The issue's preferred option is
  auto-respect by default; opt-out via `respectReducedMotion: false`. `undefined`
  means enabled.

---

## Implementation Units

### U1. Add reduced-motion detection helper

**Goal:** A pure, guarded `prefersReducedMotion()` helper.

**Requirements:** R1, R4

**Dependencies:** none

**Files:**

- `src/progress.ts` (add helper)
- `test/progress.test.ts` (add tests)

**Approach:** Export `prefersReducedMotion(): boolean`. Return `false` when
`typeof window === 'undefined'` or `window.matchMedia` is not a function;
otherwise return `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
Keep it side-effect free so it stays in the coverage-included set.

**Patterns to follow:** Mirror the existing small pure exports in
`src/progress.ts` (`clamp01`, `easeInOutCubic`).

**Test scenarios:**

- Returns `true` when `matchMedia` reports `matches: true` for the reduce query
  (stub `window.matchMedia`).
- Returns `false` when `matchMedia` reports `matches: false`.
- Returns `false` when `window.matchMedia` is undefined (delete/stub absent) —
  no throw.
- Covers R4: passes the query string `'(prefers-reduced-motion: reduce)'` to
  `matchMedia` (assert on the stub's received argument).

**Verification:** Helper unit tests pass; coverage gate unaffected.

---

### U2. Honor reduced motion in `ScrollArrow`

**Goal:** A single arrow renders static + fully drawn under reduced motion, with
an opt-out flag.

**Requirements:** R1, R2, R5

**Dependencies:** U1

**Files:**

- `src/types.ts` (add `respectReducedMotion?: boolean` to `ScrollArrowOptions`)
- `src/scroll-arrow.ts` (apply behavior)
- `test/` (new `test/reduced-motion.test.ts` for the DOM-level behavior, or
  extend `test/dom.test.ts`)

**Approach:**

- Add `respectReducedMotion?: boolean` to `ScrollArrowOptions` with a doc
  comment (default true; set false to keep the scroll animation under reduced
  motion).
- In the constructor, compute an internal `reducedMotion` flag:
  `this.opts.respectReducedMotion !== false && prefersReducedMotion()`.
- When `reducedMotion`, force `this.progress = 1` (after the existing
  `clamp01(this.opts.progress)` assignment) so the arrow paints complete.
- Gate scroll binding: in `bind()`, treat `reducedMotion` like `scroll === false`
  — do not attach `scroll`/`resize` window listeners. Still create the
  `ResizeObserver` so anchors keep tracking (R5).
- Gate `update()`: when `reducedMotion`, behave like the `scroll === false`
  branch (apply progress only). `render()` calls `applyProgress()` which will
  paint at progress 1.
- Confirm `refresh()` still re-renders correctly (it calls `render()` →
  `applyProgress()`), so a reduced-motion arrow re-draws fully after layout
  changes.

**Patterns to follow:** The existing `scroll === false` short-circuits in
`bind()` and `update()` (`src/scroll-arrow.ts`); reuse the same guard shape.

**Test scenarios:**

- Covers R1: with `matchMedia` stubbed to `matches: true`, constructing an
  arrow leaves all line segments fully drawn (`strokeDashoffset ≈ 0`) without
  any scroll event.
- Covers R1: no `scroll` listener is attached under reduced motion (spy on
  `window.addEventListener` and assert no `'scroll'` registration).
- Covers R2: with `respectReducedMotion: false` and `matches: true`, the arrow
  starts empty (offset ≈ length) and a scroll listener IS attached.
- Covers R2: with `matches: false` (no preference), default behavior is
  unchanged — starts at `progress` default, scroll listener attached.
- Covers R5: `ResizeObserver` is still constructed/observing under reduced
  motion (assert observer created; trigger `refresh()` and confirm re-render
  leaves it fully drawn).
- Edge: explicit `progress: 0` is overridden to fully drawn when reduced motion
  is active (reduced motion wins over the empty default).

**Verification:** New behavior tests pass; existing `ScrollArrow` tests
unaffected; manual demo under an emulated reduce setting shows a static arrow.

---

### U3. Honor reduced motion in `ScrollArrowGroup`

**Goal:** A group renders all arrows static + fully drawn under reduced motion.

**Requirements:** R3

**Dependencies:** U1, U2

**Files:**

- `src/types.ts` (add `respectReducedMotion?: boolean` to
  `ScrollArrowGroupOptions`)
- `src/group.ts` (apply behavior)
- `test/group.test.ts` (add scenarios)

**Approach:**

- Add `respectReducedMotion?: boolean` to `ScrollArrowGroupOptions` (default
  true).
- In the constructor, compute `reducedMotion` the same way as U2.
- The group already forces `scroll: false` on each child arrow and drives them
  via `setProgress`. So under reduced motion: skip the group's scroll binding
  (treat like `scroll === false` in `bind()`), and set group `progress = 1`
  before the initial `distribute()` so every window resolves to fully drawn.
  Simplest: when `reducedMotion`, set `this.progress = 1` prior to `update()`
  and short-circuit `update()` to `distribute()` only.
- Pass `respectReducedMotion: false` down to child arrows when constructing them
  so a child does not independently re-detect and double-handle — the group is
  the single decision point. (Children already get `scroll: false`; group
  ownership of progress is the existing contract.)

**Patterns to follow:** Existing `scroll === false` guards in `src/group.ts`
`bind()`/`update()`; child-arrow construction at `src/group.ts` constructor.

**Test scenarios:**

- Covers R3: with `matchMedia` stubbed `matches: true`, constructing a group of
  3 arrows leaves all three fully drawn without any scroll event.
- Covers R3: no group `scroll` listener attached under reduced motion.
- With `respectReducedMotion: false` + `matches: true`, group binds its scroll
  listener and arrows start per the stagger windows (not all drawn).
- With `matches: false`, default group behavior unchanged.

**Verification:** Group tests pass; `npm test` green including coverage gate.

---

### U4. Document the behavior

**Goal:** README and CHANGELOG describe auto-respect and the opt-out flag.

**Requirements:** R1, R2

**Dependencies:** U2, U3

**Files:**

- `README.md` (accessibility / options note)
- `CHANGELOG.md` (entry under unreleased)

**Approach:** Add a short "Accessibility" or bullet under "How it works":
arrows auto-respect `prefers-reduced-motion: reduce` by rendering fully drawn
with no scroll animation; disable with `respectReducedMotion: false`. Note the
flag in the options listing. Add a CHANGELOG line.

**Patterns to follow:** Existing "How it works" bullet style and CHANGELOG
format in the repo.

**Test scenarios:** Test expectation: none — docs-only unit.

**Verification:** README renders; flag documented alongside other options.

---

## Scope Boundaries

In scope:

- Auto-respect `prefers-reduced-motion: reduce` for `ScrollArrow` and
  `ScrollArrowGroup`, evaluated at construction.
- `respectReducedMotion` opt-out flag (default true) on both option types.
- Safe degradation when `matchMedia` is unavailable.

Out of scope / non-goals:

- React wrapper-specific API surface beyond passing the option through (the
  wrapper forwards options; no new React-only prop semantics).

### Deferred to Follow-Up Work

- Live subscription to `matchMedia` changes (re-render automatically when the OS
  preference flips mid-session). Current design reads once at construction;
  callers can `refresh()` or rebuild if needed.

---

## Risks & Dependencies

- **jsdom `matchMedia`:** jsdom does not implement `window.matchMedia`. The
  guard in U1 (treat missing `matchMedia` as "no preference") means existing
  tests keep their current behavior; new tests must stub `window.matchMedia`
  explicitly. Low risk, but every reduced-motion test must set the stub.
- **Double-detection in groups:** avoided by the group passing
  `respectReducedMotion: false` to children and owning the decision itself
  (U3). Without this, a child could re-detect and conflict with group-driven
  progress.
- **Default-on is a behavior change:** users on reduce who previously saw the
  animation will now see static arrows. This is the intended, expected fix per
  the issue; called out in CHANGELOG.

---

## Sources & Research

- GitHub issue #20 — "Respect prefers-reduced-motion (static fully-drawn
  fallback)".
- Existing static path the issue references: `scroll: false` + `progress: 1`
  in `src/scroll-arrow.ts` (`update()` short-circuit, `applyProgress()`).
- Coverage configuration in `vitest.config.ts` — `src/scroll-arrow.ts`,
  `src/group.ts` excluded from coverage; `src/progress.ts` included (drives
  KTD1's placement of the helper).
