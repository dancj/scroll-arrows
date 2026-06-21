---
title: 'feat: elbow / orthogonal routing mode'
type: feat
date: 2026-06-20
status: planned
origin: GitHub issue #26
---

# feat: elbow / orthogonal routing

## Summary

Routing is smooth curves + single-bend obstacle avoidance only. Tree/org-chart
diagrams want right-angle elbow connectors (the classic bracket). Add a
`route: 'elbow'` mode that builds an orthogonal polyline between the sockets
instead of a cubic bezier, drawn with the same rough.js sketch + scroll reveal.

## Requirements

- **R1** — `route: 'curved' | 'elbow'` option, default `'curved'` (unchanged
  behavior).
- **R2** — Elbow path is orthogonal (right-angle segments): same-axis sockets get
  a centered Z-bracket through the midpoint; perpendicular sockets get a single
  L-corner; center sockets fall back to the dominant delta axis.
- **R3** — Elbow mode ignores `avoid`/`curvature` (orthogonal can't honor a
  belly); the draw-on animation and arrowhead aiming still work (polyline has a
  total length; final segment enters along the end normal).

## Key Technical Decisions

- **KTD1 — `buildElbowPath(ep)` in pure geometry**, parallel to `buildPath`.
  Returns an `M … L … L …` polyline. Pure + unit testable; `scroll-arrow.ts`
  picks the builder by `route`.
- **KTD2 — Axis from socket normals.** Vertical exit = top/bottom socket,
  horizontal = left/right. This yields the natural bracket without extra config,
  and respects forced sockets.
- **KTD3 — Reuse existing arrowhead tangents.** `endTangent` already aims along
  `-endNormal`, which matches the elbow's final segment, so no head-aiming
  changes are needed.

## Implementation Units

### U1. `buildElbowPath` in geometry

- **Goal:** Orthogonal polyline builder.
- **Requirements:** R2
- **Files:** `src/geometry.ts`, `test/geometry.test.ts`
- **Approach:** Determine `startVertical`/`endVertical` from normals (center →
  dominant delta). Vertical+vertical → mid-Y Z; horizontal+horizontal → mid-X Z;
  mixed → single corner. Emit `M`/`L` with the existing `r()` rounding.
- **Test scenarios:** vertical Z-bracket; horizontal Z-bracket; both mixed
  L-corners; center-socket fallback to dominant axis.

### U2. Wire `route` into ScrollArrow

- **Goal:** Select the builder.
- **Requirements:** R1, R3
- **Dependencies:** U1
- **Files:** `src/types.ts`, `src/scroll-arrow.ts`
- **Approach:** Add `Route` type + `route?` option. In `render()`, when
  `route === 'elbow'` use `buildElbowPath(local)` and skip obstacle routing;
  otherwise the existing curved path.
- **Test scenarios:** `Test expectation: none -- thin branch; geometry covered in U1, integration via demo (jsdom lacks SVG geometry for the draw path).`

### U3. Docs + demo

- **Goal:** Document + showcase.
- **Requirements:** R1
- **Dependencies:** U2
- **Files:** `README.md`, `demo/index.html`
- **Approach:** "Elbow routing" bullet + key-options entry. New org-chart demo
  section (`#elbow-demo`) with a CEO→eng/design/ops bracket via a group with
  `route: 'elbow'`, forced bottom/top sockets.
- **Test scenarios:** `Test expectation: none -- docs/demo only.`

## Verification

- `npm run test`, `typecheck`, `lint`, `coverage` (gate), `build` all green.
