---
title: 'feat: Semantic label positioning for scrollArrow'
date: 2026-06-21
type: feat
status: ready
depth: lightweight
---

# feat: Semantic label positioning for scrollArrow

## Summary

Make the `labelAt` config accept intuitive values — the keywords `'start'`,
`'middle'`, `'end'` and percentage strings like `'25%'` — in addition to the
existing `0..1` number. Clarify `labelOffset`'s role (perpendicular distance
from the line) in docs. Fully backward compatible: numeric `labelAt` and
numeric `labelOffset` keep working unchanged.

## Problem Frame

The current label config has two axes that are easy to confuse:

- `labelAt?: number` — position **along** the line, `0..1`. Not obvious that a
  bare number means a fraction, and `0.5` reads as arbitrary.
- `labelOffset?: number` — perpendicular distance **from** the line in px.
  The name "offset" reads like it should move the label _along_ the arrow, so
  `labelOffset: 26` surprises users (it shifts sideways, not forward).

The user wants semantic, self-documenting values: `'start' | 'middle' | 'end'`
for the along-axis, and/or a percentage along the length. The perpendicular
px offset (`labelOffset`) already does what they asked for ("offsetpx to
position offset from line") — it just needs clearer documentation, not a
behavior change.

## Scope Boundaries

In scope:

- Accept `'start' | 'middle' | 'end'` and `'<n>%'` strings for `labelAt`.
- A single shared resolver that maps any accepted `labelAt` form to a clamped
  `0..1` number, used by both label placement and label fade-in.
- Doc-comment clarity on `labelAt` and `labelOffset`.
- Update demo to showcase a semantic value.

### Deferred to Follow-Up Work

- Renaming `labelOffset` (e.g. to `labelGap` / `labelDistance`). A rename is a
  breaking API change; defer unless the user wants it.
- Semantic horizontal-side keywords for `labelOffset` (e.g. `'left' | 'right'`).

Out of scope:

- Changing label rendering, fonts, background masking, or fade behavior.

---

## Key Technical Decisions

- **KTD1 — Extend `labelAt`, don't add a new field.** `labelAt` already owns
  the along-the-line axis. Widening its type keeps one concept in one place and
  stays backward compatible (number path unchanged).
- **KTD2 — Single resolver `resolveLabelAt()` returning `0..1`.** Two call
  sites consume `labelAt` today (placement in `renderLabel`, fade-in via
  `labelOpacity`). Centralizing the keyword/percentage→fraction mapping in one
  exported, unit-testable function prevents the two sites from drifting. It
  supersedes the local `clampAt` for label use (numbers still clamp).
- **KTD3 — Percentage parsing is lenient and clamped.** `'25%'` → `0.25`;
  malformed strings fall back to the `0.5` default rather than throwing, matching
  the library's existing forgiving, clamp-don't-throw style (`clampAt`,
  `unitNormal` zero-guard).
- **KTD4 — Keyword map:** `start→0`, `middle→0.5`, `end→1`.

---

## Implementation Units

### U1. Widen the `labelAt` type and document both label axes

**Goal:** Type accepts keywords + percentage strings; doc comments make the
along-vs-perpendicular distinction obvious.

**Files:**

- `src/types.ts` (modify)

**Approach:**

- Add an exported type alias, e.g.
  `export type LabelPosition = number | 'start' | 'middle' | 'end' | string;`
  (the `string` arm carries `'<n>%'`; keep the literals for editor
  autocomplete). Set `labelAt?: LabelPosition`.
- Rewrite the `labelAt` doc comment to list accepted forms: keywords, a `0..1`
  fraction, or a `'<n>%'` string. Default `'middle'`.
- Tighten the `labelOffset` doc comment to emphasize it is the **perpendicular
  distance from the line** (sideways), not a position along it.

**Patterns to follow:** existing doc-comment style in `src/types.ts`.

**Test scenarios:** Test expectation: none — type + comment only, behavior
covered by U2.

### U2. Add `resolveLabelAt()` and route both call sites through it

**Goal:** One resolver converts any `labelAt` form to a clamped `0..1`; used by
label placement and fade-in.

**Files:**

- `src/draw.ts` (modify — add and export `resolveLabelAt`; co-located with the
  other label helper `labelOpacity`)
- `src/scroll-arrow.ts` (modify — call `resolveLabelAt` at both sites)
- `test/draw.test.ts` (modify — add resolver tests)

**Approach:**

- `resolveLabelAt(value: LabelPosition | undefined, fallback = 0.5): number`:
  - `undefined` → `fallback`.
  - number → clamp to `0..1`.
  - `'start' | 'middle' | 'end'` → `0 | 0.5 | 1`.
  - `'<n>%'` → `n/100`, clamped.
  - anything else → `fallback`.
  - Reuse the existing clamp logic (move/share `clampAt`, or inline `clamp01`
    already in `draw.ts`).
- `src/scroll-arrow.ts:311` — replace
  `clampAt(this.opts.labelAt ?? 0.5)` with `resolveLabelAt(this.opts.labelAt)`.
- `src/scroll-arrow.ts:388` — pass `resolveLabelAt(this.opts.labelAt)` into
  `labelOpacity(...)` instead of the raw `this.opts.labelAt ?? 0.5`.
- Drop the now-unused local `clampAt` in `scroll-arrow.ts` if no longer
  referenced (verify line 311 was its only caller).

**Patterns to follow:** `labelOpacity` in `src/draw.ts` (exported, pure,
unit-tested); `clamp01` already in that file.

**Test scenarios** (in `test/draw.test.ts`):

- `resolveLabelAt('start')` → `0`; `'middle'` → `0.5`; `'end'` → `1`.
- `resolveLabelAt('25%')` → `0.25`; `'0%'` → `0`; `'100%'` → `1`.
- `resolveLabelAt('150%')` clamps to `1`; `'-10%'` clamps to `0`.
- `resolveLabelAt(0.3)` → `0.3`; `resolveLabelAt(2)` clamps to `1`;
  `resolveLabelAt(-1)` clamps to `0`.
- `resolveLabelAt(undefined)` → `0.5`; with explicit fallback honored.
- `resolveLabelAt('garbage')` → `0.5` (fallback, no throw).

### U3. Showcase a semantic value in the demo

**Goal:** Demo demonstrates the new ergonomic API.

**Files:**

- `demo/index.html` (modify)

**Approach:**

- Update at least one existing labelled arrow to use a semantic value, e.g.
  change the `labelAt: 0.22` example to a percentage string `'22%'`, and/or set
  a keyword like `labelAt: 'end'` on another. Keep `labelOffset` examples as-is
  to show the two axes side by side.

**Patterns to follow:** existing `scrollArrow({...})` calls in `demo/index.html`.

**Test scenarios:** Test expectation: none — demo markup, no behavioral assertion.

---

## Verification

- `resolveLabelAt` unit tests pass (keywords, percentages, numbers, clamping,
  fallback).
- Type-check passes with widened `labelAt`.
- Existing label tests (`labelOpacity`) still pass — fade-in behavior unchanged.
- Demo renders labels at the expected positions with the new semantic values.

## Requirements Trace

- Semantic `'start'/'middle'/'end'` → U1 (type), U2 (resolver + keyword map).
- Percentage along length → U1 (type), U2 (`'<n>%'` parsing).
- Px offset from line → already provided by `labelOffset`; U1 clarifies its docs.
