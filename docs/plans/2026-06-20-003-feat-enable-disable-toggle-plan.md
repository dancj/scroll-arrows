---
title: 'feat: enable/disable toggle for breakpoint-aware arrows'
type: feat
date: 2026-06-20
status: planned
origin: GitHub issue #23
---

# feat: enable/disable toggle

## Summary

On small screens a diagram often reflows (absolute overlay → vertical stack) and
its arrows should disappear. Today the only lever is `destroy()` + rebuild on
resize. Add a lightweight **`setEnabled(on)`** toggle (plus an initial `enabled`
option) that suspends and restores an arrow — hiding it and stopping its scroll
work — without tearing down the instance. Document the `matchMedia` recipe that
wires it to a breakpoint.

## Requirements

- **R1** — `ScrollArrow.setEnabled(on)` hides the arrow and stops drawing/scroll
  updates when off; shows and recomputes when back on. No teardown of the
  instance, observers, or overlay.
- **R2** — `enabled?: boolean` option (default `true`) sets the initial state; an
  arrow created `enabled: false` draws nothing and is hidden.
- **R3** — `ScrollArrowGroup` gets the same `enabled` option + `setEnabled(on)`,
  suspending/restoring the whole set.
- **R4** — Idempotent: calling `setEnabled` with the current state is a no-op.
- **R5** — Document the `matchMedia` breakpoint recipe in the README.

## Key Technical Decisions

- **KTD1 — Library exposes the toggle, not a baked-in media query.** The issue
  offers "a toggle **or** a matchMedia hook". A `setEnabled` toggle is the
  smaller, dependency-free primitive; wiring it to `matchMedia('(max-width:30rem)')`
  is a two-line caller recipe we document. Avoids parsing breakpoint strings and
  keeps the core testable (jsdom has no `matchMedia`).
- **KTD2 — Suspend = hide + guard, not disconnect.** Disabling sets
  `group.style.display = 'none'`, cancels any pending rAF, and makes `render()` /
  `update()` early-return. Observers stay connected so re-enable is instant. This
  is the "without a full teardown" the issue asks for.
- **KTD3 — Re-enable recomputes.** On enable, show the group and run
  `render()` + `update()` so geometry reflects any layout changes that happened
  while hidden.

## Implementation Units

### U1. `enabled` state + `setEnabled` on ScrollArrow

- **Goal:** Add the toggle to the core arrow.
- **Requirements:** R1, R2, R4
- **Files:** `src/types.ts`, `src/scroll-arrow.ts`, `test/scroll-arrow.test.ts` (new)
- **Approach:** Add `enabled?: boolean` to `ScrollArrowOptions`. Add private
  `enabled` (from `opts.enabled ?? true`). Guard the top of `render()` and
  `update()` with `if (!this.enabled) return;` (after the group-clear in render so
  a disabled arrow leaves an empty group). Hide via `group.style.display` in the
  constructor when starting disabled. `setEnabled(on)`: no-op if unchanged;
  otherwise flip, toggle `group.style.display`, and on-enable call
  `render()`+`update()`, on-disable cancel the pending rAF.
- **Patterns to follow:** `reducedMotion` field + guard pattern already in
  `scroll-arrow.ts`.
- **Test scenarios (jsdom — disabled path returns before SVG measurement):**
  - `enabled: false` with visible anchors → no `<path>` drawn, group hidden, no
    throw.
  - `setEnabled(false)` on an already-disabled arrow → no-op (still hidden).
  - Reduced-motion-style note: the enable→draw path needs a real browser (jsdom
    lacks `getTotalLength`); exercised manually.

### U2. `enabled` + `setEnabled` on ScrollArrowGroup

- **Goal:** Group-level parity.
- **Requirements:** R3, R4
- **Dependencies:** U1
- **Files:** `src/types.ts`, `src/group.ts`
- **Approach:** Add `enabled?: boolean` to `ScrollArrowGroupOptions`. Group
  `setEnabled(on)` delegates to each child `arrow.setEnabled(on)` and toggles its
  own scroll/resize listeners + pending rAF. Initial `enabled: false` skips
  `bind()`/initial draw.
- **Patterns to follow:** Group's existing `reducedMotion` short-circuits in
  `bind()`/`update()`.
- **Test scenarios:** `Test expectation: none -- thin delegation over U1; covered via U1 + manual.`

### U3. Document the matchMedia recipe

- **Goal:** Show the breakpoint wiring.
- **Requirements:** R5
- **Dependencies:** U1
- **Files:** `README.md`
- **Approach:** Add a "Breakpoints / responsive" subsection with a `matchMedia`
  listener calling `setEnabled`, and add `enabled` to the key-options list.
- **Test scenarios:** `Test expectation: none -- docs only.`

## Verification

- `npm run test`, `typecheck`, `lint`, `coverage` (gate), `build` all green.
