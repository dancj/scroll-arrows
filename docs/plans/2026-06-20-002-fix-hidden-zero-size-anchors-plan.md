---
title: 'fix: Tolerate hidden / zero-size anchors (defer draw until first non-zero rect)'
type: fix
date: 2026-06-20
status: planned
origin: GitHub issue #21
---

# fix: Tolerate hidden / zero-size anchors

## Summary

An arrow anchored to an element inside a `display:none` / `hidden` container (an
inactive tab panel, a collapsed accordion) gets a zero-size `getBoundingClientRect`.
That feeds degenerate or `NaN`-adjacent endpoints into the path builder, producing a
collapsed or visibly wrong arrow. Worse, an arrow constructed while its anchor is
hidden may never recover because nothing re-triggers `render()` on reveal —
`ResizeObserver` does not reliably fire for an element going from `display:none` to
visible in every engine.

This plan makes the library **tolerate** zero-size anchors: detect the degenerate
case, skip the draw (leave the group empty rather than drawing garbage), and
automatically redraw when the anchor first gains a non-zero rect. It also documents
the explicit `refresh()`-on-reveal recipe for users who prefer manual control.

---

## Problem Frame

- `docRect()` (`src/geometry.ts:18`) returns `{width: 0, height: 0}` for a
  `display:none` element. `socketPoint()` then collapses `start` and `end` toward a
  single point/origin, and `buildPath()` guards `dist` with `|| 1` but still emits a
  near-zero-length degenerate curve.
- `ScrollArrow` constructor (`src/scroll-arrow.ts:74`) calls `render()` →
  `update()` immediately. If an anchor is hidden at construction time, the first
  draw is degenerate.
- `bind()` (`src/scroll-arrow.ts:329`) observes anchors with `ResizeObserver`. A
  `display:none → display:block` transition is **not** a guaranteed `ResizeObserver`
  callback across engines, so reveal may not redraw.
- `refresh()` (`src/scroll-arrow.ts:109`) exists but is undocumented for the
  show/hide lifecycle.

## Requirements

- **R1** — Detect when either anchor (`start` or `end`) has a degenerate
  (zero-area) rect and skip drawing rather than emitting a collapsed/garbage arrow.
- **R2** — Automatically redraw when a previously-degenerate anchor first gains a
  non-zero rect (tab reveal, accordion expand), without the user calling
  `refresh()`.
- **R3** — Keep behavior unchanged for the normal (both anchors visible) path —
  no extra observers wired when not needed, no perf regression on scroll.
- **R4** — Clean teardown: any reveal observer is disconnected in `destroy()`.
- **R5** — Document the `refresh()`-on-reveal pattern for tabs/accordions in the
  README, and add a demo section exercising a hidden-then-revealed anchor.

---

## Key Technical Decisions

- **KTD1 — Detection lives in `geometry.ts` as a pure predicate.** Add
  `isDegenerateRect(r: DocRect): boolean` returning `true` when `width <= 0 || height <= 0`.
  Pure function, trivially unit-testable, keeps `scroll-arrow.ts` declarative. Use
  `<= 0` (not `=== 0`) to defend against sub-pixel/negative rects from collapsed
  flex/grid children.
- **KTD2 — Reveal detection uses `IntersectionObserver`, not polling or extra
  `ResizeObserver` churn.** `IntersectionObserver` fires when a hidden element
  becomes laid-out/visible and is widely supported. Wire it **lazily** — only when
  `render()` detects a degenerate anchor — so the common path adds zero observers
  (satisfies R3). Once a successful (non-degenerate) render occurs, disconnect the
  reveal observer.
- **KTD3 — On degenerate render, clear the group and bail early.** `render()`
  already clears `this.group` at the top (`src/scroll-arrow.ts:156`); after
  detecting degeneracy it returns before appending any drawable, leaving an empty
  (invisible) group. No `NaN` ever reaches the DOM.
- **KTD4 — Reveal observer observes the degenerate anchor(s) only.** Observing the
  specific hidden anchor(s) (not the whole document) keeps callbacks scoped. On any
  intersection/resize callback, call `render()`; if it succeeds (non-degenerate),
  tear the reveal observer down.
- **KTD5 — No new public option.** Tolerance is always-on and strictly better than
  drawing garbage; gating it behind a flag would surprise users who hit the bug.
  `refresh()` stays the documented manual escape hatch.

---

## Implementation Units

### U1. Degenerate-rect predicate in geometry

- **Goal:** Provide a pure, exported predicate for zero-area rects.
- **Requirements:** R1
- **Dependencies:** none
- **Files:** `src/geometry.ts`, `test/geometry.test.ts`
- **Approach:** Add `export function isDegenerateRect(r: DocRect): boolean` →
  `r.width <= 0 || r.height <= 0`. Place near `docRect`. No change to existing
  exports.
- **Patterns to follow:** Existing small pure helpers in `geometry.ts` (`center`,
  `unit`).
- **Test scenarios:**
  - Returns `true` for `{width: 0, height: 0}` (display:none case).
  - Returns `true` for `{width: 100, height: 0}` and `{width: 0, height: 50}`
    (one collapsed axis).
  - Returns `true` for a negative dimension `{width: -1, height: 10}`.
  - Returns `false` for a normal `{width: 100, height: 40}` rect.

### U2. Skip degenerate draw + lazy reveal observer in ScrollArrow

- **Goal:** Detect degenerate anchors in `render()`, skip the draw, and arm an
  `IntersectionObserver` that redraws on reveal; tear it down once drawn.
- **Requirements:** R1, R2, R3, R4
- **Dependencies:** U1
- **Files:** `src/scroll-arrow.ts`, `test/scroll-arrow.test.ts` (new)
- **Approach:**
  - In `render()`, after computing `sr`/`er` rects (move the `docRect` calls so
    both are available, or compute in `computeEndpoints` and surface), check
    `isDegenerateRect` for `start` and `end`. If either is degenerate: clear the
    group (already done at top), set a `private degenerate = true` flag, arm the
    reveal observer on the degenerate anchor(s), and `return` before drawing.
  - Add `private revealObs?: IntersectionObserver`. `armReveal(anchors: Element[])`
    creates it lazily (guard so it is not re-created each degenerate render) and
    observes each degenerate anchor. Callback calls `this.render()`.
  - On a successful render (no degeneracy), disconnect and clear `revealObs`.
  - `destroy()` (`src/scroll-arrow.ts:114`) disconnects `revealObs` alongside `ro`.
- **Patterns to follow:** Existing `ResizeObserver` wiring in `bind()`
  (`src/scroll-arrow.ts:329`) and teardown in `destroy()`.
- **Test scenarios (jsdom):**
  - Construct an arrow with a `display:none` start anchor → group has no `<path>`
    children (no garbage drawn), no thrown error.
  - Stub `getBoundingClientRect` to return zero then non-zero; manually invoke the
    reveal callback (or call `refresh()`) → group now contains line `<path>`(s).
  - Construct with both anchors visible → no `IntersectionObserver` instantiated
    (spy on the constructor) — proves R3 zero-overhead common path.
  - `destroy()` after a degenerate render → reveal observer `disconnect()` called.
  - Covers the no-`NaN` guarantee: assert no path `d` attribute contains `NaN`.
- **Execution note:** jsdom lacks a real `IntersectionObserver`/`ResizeObserver`;
  follow the existing test setup pattern (check `test/dom.test.ts` for how the DOM
  globals/observers are stubbed) and stub `IntersectionObserver` to capture the
  callback for manual invocation.

### U3. Document the reveal lifecycle + demo

- **Goal:** Document the automatic tolerance and the manual `refresh()`-on-reveal
  recipe; add a demo exercising a hidden→revealed anchor.
- **Requirements:** R5
- **Dependencies:** U2
- **Files:** `README.md`, `demo/index.html`
- **Approach:** Add a short "Hidden anchors / tabs & accordions" subsection to the
  README: explain arrows auto-recover on reveal, and show the explicit
  `arrow.refresh()` call in a tab-switch handler as the deterministic option. Add a
  demo block with a tabbed panel where an arrow targets an element in an initially
  inactive tab.
- **Patterns to follow:** Existing README option docs and `demo/index.html`
  structure.
- **Test scenarios:** `Test expectation: none -- docs/demo only, no behavioral code.`

---

## Scope Boundaries

In scope: zero-area anchor tolerance, automatic reveal redraw, docs + demo.

### Deferred to Follow-Up Work

- General "anchor removed from DOM entirely" handling (distinct from hidden) —
  current behavior is to draw nothing, acceptable for now.
- Debouncing rapid show/hide toggles beyond what the single redraw provides.

Out of scope: changing the path/curve math, new public options, SSR concerns
(tracked separately in issue #22).

---

## Risks & Dependencies

- **R-risk1:** `IntersectionObserver` callback could fire while the anchor is laid
  out but still zero-area (e.g. `visibility:hidden` with collapsed box). Mitigation:
  the callback re-runs `render()`, which re-checks `isDegenerateRect` and simply
  stays degenerate (no redraw, observer remains armed) — idempotent and safe.
- **R-risk2:** jsdom observer stubbing is fiddly. Mitigation: follow existing DOM
  test patterns; keep the predicate (U1) covered by pure unit tests so the core
  logic is verified independent of observer plumbing.

## Verification

- `npm run test` green (new geometry + scroll-arrow tests pass).
- `npm run typecheck` and `npm run lint` clean.
- `npm run coverage` meets the existing gate.
- Manual: demo tab-reveal draws a correct arrow on tab switch.
