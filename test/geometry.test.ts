import { describe, it, expect } from 'vitest';
import {
  resolveEndpoints,
  buildPath,
  buildElbowPath,
  arrowHeadPath,
  endTangent,
  startTangent,
  unitNormal,
  routeBellies,
  samplePath,
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

// Bare Endpoints without DOM rects: straight chord unless normals are given.
function eps(
  start: { x: number; y: number },
  end: { x: number; y: number },
  startNormal = { x: 0, y: 0 },
  endNormal = { x: 0, y: 0 },
) {
  return { start, end, startNormal, endNormal };
}

// True when every sample of the routed curve stays out of every
// padding-inflated box — the contract routeBellies is meant to deliver.
function routedCurveClears(
  ep: ReturnType<typeof eps>,
  curvature: number,
  boxes: Box[],
  padding = 14,
): boolean {
  const { b1, b2 } = routeBellies(ep, curvature, boxes, padding);
  const pts = samplePath(ep, curvature, b1, b2);
  return pts.every((p) =>
    boxes.every(
      (b) =>
        p.x <= b.left - padding ||
        p.x >= b.left + b.width + padding ||
        p.y <= b.top - padding ||
        p.y >= b.top + b.height + padding,
    ),
  );
}

describe('samplePath', () => {
  it('first and last samples are exactly the endpoints', () => {
    const pts = samplePath(eps({ x: 0, y: 0 }, { x: 200, y: 0 }), 0.5);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 200, y: 0 });
  });

  it('a zero-curvature center-socket cubic samples onto the segment', () => {
    // center sockets fall back to the straight direction, so with the belly
    // at zero every sample sits on the chord.
    const pts = samplePath(eps({ x: 0, y: 0 }, { x: 200, y: 0 }), 0);
    for (const p of pts) expect(p.y).toBeCloseTo(0);
  });

  it('scales sample density with chord length for page-scale arrows', () => {
    const pts = samplePath(eps({ x: 0, y: 0 }, { x: 2400, y: 0 }), 0.5);
    // ~1 sample per 25px so a padded pill can't fit between samples.
    expect(pts.length).toBeGreaterThan(90);
  });
});

describe('routeBellies', () => {
  // horizontal line from (0,0) to (200,0); left normal points up (-y).
  const line = eps({ x: 0, y: 0 }, { x: 200, y: 0 });
  const box = (b: Partial<Box>): Box => ({
    left: 0,
    top: 0,
    width: 20,
    height: 20,
    ...b,
  });
  const zero = { x: 0, y: 0 };

  it('returns zero bellies when there are no obstacles', () => {
    expect(routeBellies(line, 0, [])).toEqual({ b1: zero, b2: zero });
  });

  it('returns zero bellies for a box the curve already clears', () => {
    // centered at (100, 200): far below the line.
    const r = routeBellies(line, 0, [box({ left: 90, top: 190 })]);
    expect(r).toEqual({ b1: zero, b2: zero });
  });

  it('returns zero bellies for a box behind the start', () => {
    const r = routeBellies(line, 0, [box({ left: -110, top: -10 })]);
    expect(r).toEqual({ b1: zero, b2: zero });
  });

  it('bows the curve clear of a box straddling the chord', () => {
    const boxes = [box({ left: 90, top: -10 })];
    const { b1, b2 } = routeBellies(line, 0, boxes);
    // straddling center -> default push side is up (-y), like the old router.
    expect(b1.y).toBeLessThan(0);
    expect(b2.y).toBeLessThan(0);
    expect(routedCurveClears(line, 0, boxes)).toBe(true);
  });

  it('pushes to the side opposite the obstacle center', () => {
    const boxes = [box({ left: 90, top: -18 })];
    const { b1, b2 } = routeBellies(line, 0, boxes);
    expect(b1.y).toBeGreaterThan(0);
    expect(b2.y).toBeGreaterThan(0);
    expect(routedCurveClears(line, 0, boxes)).toBe(true);
  });

  it('detects a box the chord clears but the bowed curve clips (issue #55 mode 1)', () => {
    // Top sockets bow the curve upward: reach = 200 * (0.3 + 0.4*0.5) = 100,
    // putting the bow's apex at (100, -75). A box there clears the chord
    // (y=0) by 65 > padding 14, so the old chord-based router returned zero —
    // but the rendered bow passes straight through it.
    const bowed = eps(
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: -1 },
    );
    const boxes = [box({ left: 90, top: -85 })];
    const { b1, b2 } = routeBellies(bowed, 0.5, boxes);
    expect(Math.hypot(b1.x, b1.y) + Math.hypot(b2.x, b2.y)).toBeGreaterThan(0);
    expect(routedCurveClears(bowed, 0.5, boxes)).toBe(true);
  });

  it('clears an end-adjacent obstacle by driving the near control point (issue #55 mode 2)', () => {
    // Box straddling the chord at t ≈ 0.85 — equal-belly routing attenuates
    // to ~0.4x here and mathematically cannot clear it.
    const boxes = [box({ left: 160, top: -10 })];
    const { b1, b2 } = routeBellies(line, 0, boxes);
    expect(Math.abs(b2.y)).toBeGreaterThan(Math.abs(b1.y));
    expect(routedCurveClears(line, 0, boxes)).toBe(true);
  });

  it('clears multiple obstacles on the same side of the chord', () => {
    const boxes = [
      box({ left: 50, top: -10, width: 12, height: 12 }),
      box({ left: 130, top: -10 }),
    ];
    expect(routedCurveClears(line, 0, boxes)).toBe(true);
  });

  it('issue #55 repro: root→branch gutter run stays finite and clear', () => {
    // Left-aligned tree: root-left socket (60,300), branch-left socket
    // (96,100), sibling pills extending right from x=96.
    const gutter = eps(
      { x: 60, y: 300 },
      { x: 96, y: 100 },
      { x: -1, y: 0 },
      { x: -1, y: 0 },
    );
    const pills: Box[] = [
      { left: 96, top: 136, width: 120, height: 28 },
      { left: 96, top: 186, width: 120, height: 28 },
      { left: 96, top: 236, width: 120, height: 28 },
    ];
    const { b1, b2 } = routeBellies(gutter, 0.3, pills);
    for (const v of [b1.x, b1.y, b2.x, b2.y]) expect(Number.isFinite(v)).toBe(true);
    expect(routedCurveClears(gutter, 0.3, pills)).toBe(true);
  });

  it('caps displacement and stays finite for a box overlapping the endpoint', () => {
    // Geometrically unclearable: the curve must terminate inside the padded
    // box. Best-effort per R5 — finite, capped, terminates.
    const boxes = [box({ left: 190, top: -10 })];
    const { b1, b2 } = routeBellies(line, 0, boxes);
    const cap = 1.5 * 200 + 1e-6;
    for (const b of [b1, b2]) {
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
      expect(Math.hypot(b.x, b.y)).toBeLessThanOrEqual(cap);
    }
  });
});

// pull the first control point's x out of an "M .. C cx cy .. .. .. .." string
function controlX(d: string): number {
  const parts = d.split(' ');
  const cIdx = parts.indexOf('C');
  return Number(parts[cIdx + 1]);
}
