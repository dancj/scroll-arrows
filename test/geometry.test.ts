import { describe, it, expect } from 'vitest';
import {
  resolveEndpoints,
  buildPath,
  buildElbowPath,
  arrowHeadPath,
  endTangent,
  startTangent,
  unitNormal,
  routeOffset,
  isDegenerateRect,
  type DocRect,
  type Box,
} from '../src/geometry';

const A: DocRect = { left: 0, top: 0, width: 100, height: 100 };
const RIGHT: DocRect = { left: 300, top: 0, width: 100, height: 100 };
const BELOW: DocRect = { left: 0, top: 300, width: 100, height: 100 };

describe('isDegenerateRect', () => {
  it('is true for a display:none anchor (zero on both axes)', () => {
    expect(isDegenerateRect({ left: 0, top: 0, width: 0, height: 0 })).toBe(
      true,
    );
  });

  it('is true when either axis is collapsed', () => {
    expect(isDegenerateRect({ left: 0, top: 0, width: 100, height: 0 })).toBe(
      true,
    );
    expect(isDegenerateRect({ left: 0, top: 0, width: 0, height: 50 })).toBe(
      true,
    );
  });

  it('is true for a negative dimension', () => {
    expect(isDegenerateRect({ left: 0, top: 0, width: -1, height: 10 })).toBe(
      true,
    );
  });

  it('is false for a normal laid-out rect', () => {
    expect(isDegenerateRect({ left: 0, top: 0, width: 100, height: 40 })).toBe(
      false,
    );
  });
});

describe('resolveEndpoints', () => {
  it('auto-picks the right edge of A and left edge of a box to its right', () => {
    const ep = resolveEndpoints(A, RIGHT, 'auto', 'auto');
    expect(ep.start).toEqual({ x: 100, y: 50 }); // right edge of A
    expect(ep.startNormal).toEqual({ x: 1, y: 0 });
    expect(ep.end).toEqual({ x: 300, y: 50 }); // left edge of RIGHT
    expect(ep.endNormal).toEqual({ x: -1, y: 0 });
  });

  it('auto-picks bottom/top for a vertically stacked pair', () => {
    const ep = resolveEndpoints(A, BELOW, 'auto', 'auto');
    expect(ep.start).toEqual({ x: 50, y: 100 }); // bottom of A
    expect(ep.startNormal).toEqual({ x: 0, y: 1 });
    expect(ep.end).toEqual({ x: 50, y: 300 }); // top of BELOW
    expect(ep.endNormal).toEqual({ x: 0, y: -1 });
  });

  it('honors forced sockets', () => {
    const ep = resolveEndpoints(A, RIGHT, 'top', 'bottom');
    expect(ep.start).toEqual({ x: 50, y: 0 });
    expect(ep.end).toEqual({ x: 350, y: 100 });
  });

  it('center socket yields a zero normal', () => {
    const ep = resolveEndpoints(A, RIGHT, 'center', 'center');
    expect(ep.start).toEqual({ x: 50, y: 50 });
    expect(ep.startNormal).toEqual({ x: 0, y: 0 });
  });

  it('slides the start point along a horizontal edge by the socket offset', () => {
    // bottom edge of A is y=100; offset +0.25 of width(100) shifts x by +25.
    const ep = resolveEndpoints(A, BELOW, 'bottom', 'top', 0.25);
    expect(ep.start).toEqual({ x: 75, y: 100 });
    expect(ep.end).toEqual({ x: 50, y: 300 }); // end offset defaults to 0
  });

  it('slides the end point along a vertical edge by the socket offset', () => {
    // right edge of RIGHT-of-A geometry: use left edge of RIGHT (x=300), shift y.
    const ep = resolveEndpoints(A, RIGHT, 'right', 'left', 0, -0.25);
    expect(ep.end).toEqual({ x: 300, y: 25 }); // y center 50 - 0.25*100
  });

  it('clamps socket offset to the edge (|offset| <= 0.5)', () => {
    const ep = resolveEndpoints(A, BELOW, 'bottom', 'top', 5);
    expect(ep.start).toEqual({ x: 100, y: 100 }); // clamped to +0.5 → corner
  });

  it('fans out three arrows sharing one bottom edge', () => {
    const offsets = [-0.3, 0, 0.3];
    const xs = offsets.map(
      (o) => resolveEndpoints(A, BELOW, 'bottom', 'top', o).start.x,
    );
    expect(xs).toEqual([20, 50, 80]); // spread across the edge, no stacking
  });
});

describe('buildPath', () => {
  it('produces a cubic that starts and ends on the endpoints', () => {
    const ep = resolveEndpoints(A, RIGHT, 'auto', 'auto');
    const d = buildPath(ep, 0.5);
    expect(d.startsWith('M 100 50 C')).toBe(true);
    expect(d.trimEnd().endsWith('300 50')).toBe(true);
  });

  it('bows control points further out as curvature rises', () => {
    const ep = resolveEndpoints(A, RIGHT, 'auto', 'auto');
    const flat = controlX(buildPath(ep, 0));
    const bent = controlX(buildPath(ep, 1));
    // Higher curvature pushes the first control point further right of start.
    expect(bent).toBeGreaterThan(flat);
  });

  it('falls back to the straight direction for center sockets', () => {
    const ep = resolveEndpoints(A, RIGHT, 'center', 'center');
    const d = buildPath(ep, 0.5);
    expect(d.startsWith('M 50 50 C')).toBe(true);
  });
});

describe('buildElbowPath', () => {
  it('Z-bends through the mid-Y for a vertical (top/bottom) pair', () => {
    // start bottom of A (50,100), end top of a box below-and-right (350,300).
    const belowRight: DocRect = {
      left: 300,
      top: 300,
      width: 100,
      height: 100,
    };
    const ep = resolveEndpoints(A, belowRight, 'bottom', 'top');
    // mid-Y between 100 and 300 = 200; bracket: down, across, down.
    expect(buildElbowPath(ep)).toBe('M 50 100 L 50 200 L 350 200 L 350 300');
  });

  it('Z-bends through the mid-X for a horizontal (left/right) pair', () => {
    // start right of A (100,50), end left of a box to the right-and-down (300,250).
    const rightLow: DocRect = { left: 300, top: 200, width: 100, height: 100 };
    const ep = resolveEndpoints(A, rightLow, 'right', 'left');
    expect(buildElbowPath(ep)).toBe('M 100 50 L 200 50 L 200 250 L 300 250');
  });

  it('single L-corner when start is vertical and end is horizontal', () => {
    // start bottom of A (50,100), end left edge of RIGHT (300,50).
    const ep = resolveEndpoints(A, RIGHT, 'bottom', 'left');
    expect(buildElbowPath(ep)).toBe('M 50 100 L 50 50 L 300 50');
  });

  it('single L-corner when start is horizontal and end is vertical', () => {
    // start right of A (100,50), end top of BELOW (50,300).
    const ep = resolveEndpoints(A, BELOW, 'right', 'top');
    expect(buildElbowPath(ep)).toBe('M 100 50 L 50 50 L 50 300');
  });

  it('falls back to the dominant delta axis for center sockets', () => {
    // center→center, BELOW is mostly vertical → treated as a vertical pair.
    const ep = resolveEndpoints(A, BELOW, 'center', 'center');
    expect(buildElbowPath(ep).startsWith('M 50 50 L')).toBe(true);
  });
});

describe('arrowHeadPath', () => {
  it('draws two strokes meeting at the tip', () => {
    const d = arrowHeadPath({ x: 100, y: 0 }, { x: 1, y: 0 }, 14);
    expect(d).toMatch(/^M .+ L 100 0 L .+$/);
  });
});

describe('tangents', () => {
  it('end tangent points inward along the inverse end normal', () => {
    const ep = resolveEndpoints(A, RIGHT, 'auto', 'auto');
    expect(endTangent(ep)).toEqual({ x: 1, y: 0 }); // -(-1,0)
  });

  it('start tangent points away from the start edge', () => {
    const ep = resolveEndpoints(A, RIGHT, 'auto', 'auto');
    expect(startTangent(ep)).toEqual({ x: -1, y: 0 }); // -(1,0)
  });

  it('center socket tangents fall back to the straight line', () => {
    const ep = resolveEndpoints(A, RIGHT, 'center', 'center');
    const t = endTangent(ep);
    expect(t.x).toBeCloseTo(1);
    expect(t.y).toBeCloseTo(0);
  });
});

describe('unitNormal', () => {
  it('points up (screen y-down) for rightward travel — the left side', () => {
    expect(unitNormal({ x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      x: 0,
      y: -1,
    });
  });

  it('points right for downward travel', () => {
    // travel +y (down) -> left-hand normal points +x
    expect(unitNormal({ x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: 1, y: 0 });
  });

  it('returns a unit-length vector for diagonals', () => {
    const n = unitNormal({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
  });

  it('returns zero for a degenerate segment', () => {
    expect(unitNormal({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});

describe('routeOffset', () => {
  // horizontal line from (0,0) to (200,0); left normal points up (-y).
  const start = { x: 0, y: 0 };
  const end = { x: 200, y: 0 };
  const box = (b: Partial<Box>): Box => ({
    left: 0,
    top: 0,
    width: 20,
    height: 20,
    ...b,
  });

  it('returns zero when there are no obstacles', () => {
    expect(routeOffset(start, end, [])).toEqual({ x: 0, y: 0 });
  });

  it('returns zero for a box that does not block the line', () => {
    // centered at (100, 200): far below the line, clears easily.
    const off = routeOffset(start, end, [box({ left: 90, top: 190 })]);
    expect(off).toEqual({ x: 0, y: 0 });
  });

  it('returns zero for a box past the endpoints longitudinally', () => {
    // centered at (-100, 0): behind the start.
    const off = routeOffset(start, end, [box({ left: -110, top: -10 })]);
    expect(off).toEqual({ x: 0, y: 0 });
  });

  it('bows the curve perpendicular to clear a box on the line', () => {
    // box straddling the line at x≈100 (center 100,0), 20x20, padding 14.
    const off = routeOffset(start, end, [box({ left: 90, top: -10 })], 14);
    expect(off.x).toBeCloseTo(0); // push is purely perpendicular (vertical)
    // center signed offset 0 -> push to +1 side along normal (-y): clearance
    // = radius(10) + padding(14) = 24, along normal (0,-1) -> y = -24.
    expect(off.y).toBeCloseTo(-24);
  });

  it('pushes to the side opposite the obstacle center', () => {
    // box center slightly above the line (negative y -> signed positive on the
    // up-normal) should push the curve down (+y).
    const off = routeOffset(start, end, [box({ left: 90, top: -18 })], 14);
    expect(off.y).toBeGreaterThan(0);
  });

  it('picks the worst blocker among several', () => {
    const off = routeOffset(
      start,
      end,
      [
        box({ left: 50, top: -6, width: 12, height: 12 }),
        box({ left: 120, top: -40, width: 60, height: 60 }),
      ],
      14,
    );
    // the larger, line-crossing box at x=150 dominates.
    expect(Math.abs(off.y)).toBeGreaterThan(20);
  });
});

// pull the first control point's x out of an "M .. C cx cy .. .. .. .." string
function controlX(d: string): number {
  const parts = d.split(' ');
  const cIdx = parts.indexOf('C');
  return Number(parts[cIdx + 1]);
}
