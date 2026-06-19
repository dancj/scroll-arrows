import { describe, it, expect } from "vitest";
import {
  resolveEndpoints,
  buildPath,
  arrowHeadPath,
  endTangent,
  startTangent,
  unitNormal,
  type DocRect,
} from "../src/geometry";

const A: DocRect = { left: 0, top: 0, width: 100, height: 100 };
const RIGHT: DocRect = { left: 300, top: 0, width: 100, height: 100 };
const BELOW: DocRect = { left: 0, top: 300, width: 100, height: 100 };

describe("resolveEndpoints", () => {
  it("auto-picks the right edge of A and left edge of a box to its right", () => {
    const ep = resolveEndpoints(A, RIGHT, "auto", "auto");
    expect(ep.start).toEqual({ x: 100, y: 50 }); // right edge of A
    expect(ep.startNormal).toEqual({ x: 1, y: 0 });
    expect(ep.end).toEqual({ x: 300, y: 50 }); // left edge of RIGHT
    expect(ep.endNormal).toEqual({ x: -1, y: 0 });
  });

  it("auto-picks bottom/top for a vertically stacked pair", () => {
    const ep = resolveEndpoints(A, BELOW, "auto", "auto");
    expect(ep.start).toEqual({ x: 50, y: 100 }); // bottom of A
    expect(ep.startNormal).toEqual({ x: 0, y: 1 });
    expect(ep.end).toEqual({ x: 50, y: 300 }); // top of BELOW
    expect(ep.endNormal).toEqual({ x: 0, y: -1 });
  });

  it("honors forced sockets", () => {
    const ep = resolveEndpoints(A, RIGHT, "top", "bottom");
    expect(ep.start).toEqual({ x: 50, y: 0 });
    expect(ep.end).toEqual({ x: 350, y: 100 });
  });

  it("center socket yields a zero normal", () => {
    const ep = resolveEndpoints(A, RIGHT, "center", "center");
    expect(ep.start).toEqual({ x: 50, y: 50 });
    expect(ep.startNormal).toEqual({ x: 0, y: 0 });
  });
});

describe("buildPath", () => {
  it("produces a cubic that starts and ends on the endpoints", () => {
    const ep = resolveEndpoints(A, RIGHT, "auto", "auto");
    const d = buildPath(ep, 0.5);
    expect(d.startsWith("M 100 50 C")).toBe(true);
    expect(d.trimEnd().endsWith("300 50")).toBe(true);
  });

  it("bows control points further out as curvature rises", () => {
    const ep = resolveEndpoints(A, RIGHT, "auto", "auto");
    const flat = controlX(buildPath(ep, 0));
    const bent = controlX(buildPath(ep, 1));
    // Higher curvature pushes the first control point further right of start.
    expect(bent).toBeGreaterThan(flat);
  });

  it("falls back to the straight direction for center sockets", () => {
    const ep = resolveEndpoints(A, RIGHT, "center", "center");
    const d = buildPath(ep, 0.5);
    expect(d.startsWith("M 50 50 C")).toBe(true);
  });
});

describe("arrowHeadPath", () => {
  it("draws two strokes meeting at the tip", () => {
    const d = arrowHeadPath({ x: 100, y: 0 }, { x: 1, y: 0 }, 14);
    expect(d).toMatch(/^M .+ L 100 0 L .+$/);
  });
});

describe("tangents", () => {
  it("end tangent points inward along the inverse end normal", () => {
    const ep = resolveEndpoints(A, RIGHT, "auto", "auto");
    expect(endTangent(ep)).toEqual({ x: 1, y: 0 }); // -(-1,0)
  });

  it("start tangent points away from the start edge", () => {
    const ep = resolveEndpoints(A, RIGHT, "auto", "auto");
    expect(startTangent(ep)).toEqual({ x: -1, y: 0 }); // -(1,0)
  });

  it("center socket tangents fall back to the straight line", () => {
    const ep = resolveEndpoints(A, RIGHT, "center", "center");
    const t = endTangent(ep);
    expect(t.x).toBeCloseTo(1);
    expect(t.y).toBeCloseTo(0);
  });
});

describe("unitNormal", () => {
  it("points up (screen y-down) for rightward travel — the left side", () => {
    expect(unitNormal({ x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 0, y: -1 });
  });

  it("points right for downward travel", () => {
    // travel +y (down) -> left-hand normal points +x
    expect(unitNormal({ x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: 1, y: 0 });
  });

  it("returns a unit-length vector for diagonals", () => {
    const n = unitNormal({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
  });

  it("returns zero for a degenerate segment", () => {
    expect(unitNormal({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});

// pull the first control point's x out of an "M .. C cx cy .. .. .. .." string
function controlX(d: string): number {
  const parts = d.split(" ");
  const cIdx = parts.indexOf("C");
  return Number(parts[cIdx + 1]);
}
