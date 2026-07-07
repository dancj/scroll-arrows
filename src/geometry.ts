import type { Point, Socket } from './types';

const SIDES: Exclude<Socket, 'auto' | 'center'>[] = [
  'top',
  'bottom',
  'left',
  'right',
];

/** Document-coordinate rect (survives scrolling, unlike getBoundingClientRect). */
export interface DocRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function docRect(el: Element): DocRect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left + window.scrollX,
    top: r.top + window.scrollY,
    width: r.width,
    height: r.height,
  };
}

/**
 * A rect is degenerate when either axis has no extent — the case you get from a
 * `display:none` anchor (a hidden tab panel, a collapsed accordion). Such a rect
 * collapses both endpoints toward a point and yields a garbage arrow, so callers
 * should skip drawing until the anchor gains a real box. `<= 0` (not `=== 0`)
 * also rejects negative/sub-pixel rects from collapsed flex/grid children.
 */
export function isDegenerateRect(r: DocRect): boolean {
  return r.width <= 0 || r.height <= 0;
}

function center(r: DocRect): Point {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * The anchor point on a given edge of a rect. `offset` slides the point along
 * the edge as a fraction of the edge length: `0` = centered, `-0.5`/`+0.5` =
 * the corners (clamped to that range so it stays on the edge). Used to fan out
 * several arrows that share an edge so they don't stack on one point.
 */
function socketPoint(r: DocRect, side: Socket, offset = 0): Point {
  const c = center(r);
  const o = offset < -0.5 ? -0.5 : offset > 0.5 ? 0.5 : offset;
  switch (side) {
    case 'top':
      return { x: c.x + o * r.width, y: r.top };
    case 'bottom':
      return { x: c.x + o * r.width, y: r.top + r.height };
    case 'left':
      return { x: r.left, y: c.y + o * r.height };
    case 'right':
      return { x: r.left + r.width, y: c.y + o * r.height };
    default:
      return c;
  }
}

/** Outward unit normal for an edge — direction the curve should leave/enter. */
function socketNormal(side: Socket): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

/** Pick the edge whose anchor sits closest to the other element's center. */
function autoSide(self: DocRect, other: DocRect): Socket {
  const target = center(other);
  let best: Socket = 'right';
  let bestDist = Infinity;
  for (const side of SIDES) {
    const p = socketPoint(self, side);
    const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = side;
    }
  }
  return best;
}

export interface Endpoints {
  start: Point;
  end: Point;
  startNormal: Point;
  endNormal: Point;
}

export function resolveEndpoints(
  startRect: DocRect,
  endRect: DocRect,
  startSocket: Socket,
  endSocket: Socket,
  startOffset = 0,
  endOffset = 0,
): Endpoints {
  const s = startSocket === 'auto' ? autoSide(startRect, endRect) : startSocket;
  const e = endSocket === 'auto' ? autoSide(endRect, startRect) : endSocket;
  return {
    start: socketPoint(startRect, s, startOffset),
    end: socketPoint(endRect, e, endOffset),
    startNormal: socketNormal(s),
    endNormal: socketNormal(e),
  };
}

/**
 * Control points of the cubic between endpoints. Pushed out along each socket
 * normal so the curve leaves/enters edges cleanly; `curvature` (0..~1) scales
 * how far they bow out. `b1`/`b2` are extra per-control displacements from
 * obstacle routing. Shared by buildPath and samplePath so detection and
 * rendering agree on the exact same curve.
 */
function cubicControls(
  ep: Endpoints,
  curvature: number,
  b1: Point,
  b2: Point,
): { c1: Point; c2: Point } {
  const { start, end, startNormal, endNormal } = ep;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy) || 1;
  const reach = dist * (0.3 + curvature * 0.4);

  // If a normal is zero (center socket), fall back to the straight direction.
  const sn = startNormal.x || startNormal.y ? startNormal : unit(dx, dy);
  const en = endNormal.x || endNormal.y ? endNormal : unit(-dx, -dy);

  return {
    c1: { x: start.x + sn.x * reach + b1.x, y: start.y + sn.y * reach + b1.y },
    c2: { x: end.x + en.x * reach + b2.x, y: end.y + en.y * reach + b2.y },
  };
}

const ZERO: Point = { x: 0, y: 0 };

/**
 * Build a cubic-bezier `d` string between endpoints. `b1`/`b2` displace the
 * start-side and end-side control points independently (obstacle routing
 * pushes the control nearest the blocker hardest).
 */
export function buildPath(
  ep: Endpoints,
  curvature: number,
  b1: Point = ZERO,
  b2: Point = ZERO,
): string {
  const { start, end } = ep;
  const { c1, c2 } = cubicControls(ep, curvature, b1, b2);
  return `M ${r(start.x)} ${r(start.y)} C ${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(end.x)} ${r(end.y)}`;
}

/**
 * Flatten the cubic buildPath would emit into uniformly-spaced parameter
 * samples. Sample count scales with chord length (~1 per 25px, min 24,
 * max 400) so sample spacing stays below a padded obstacle's extent for
 * chords up to ~10000px. First/last samples are exactly the endpoints.
 */
export function samplePath(
  ep: Endpoints,
  curvature: number,
  b1: Point = ZERO,
  b2: Point = ZERO,
): Point[] {
  const { start, end } = ep;
  const dist = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const n = Math.max(24, Math.min(400, Math.round(dist / 25)));
  const { c1, c2 } = cubicControls(ep, curvature, b1, b2);

  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * t * u * u;
    const w2 = 3 * t * t * u;
    const w3 = t * t * t;
    pts.push({
      x: w0 * start.x + w1 * c1.x + w2 * c2.x + w3 * end.x,
      y: w0 * start.y + w1 * c1.y + w2 * c2.y + w3 * end.y,
    });
  }
  // Pin the ends exactly (float noise from the weight sums).
  pts[0] = { x: start.x, y: start.y };
  pts[n] = { x: end.x, y: end.y };
  return pts;
}

/**
 * Build an orthogonal (right-angle "elbow") `d` string between endpoints — the
 * classic tree / org-chart bracket. The exit/entry axes follow each socket
 * normal: same-axis sockets get a Z-bend through the midpoint (a centered
 * bracket); perpendicular sockets get a single L-corner. Center sockets (no
 * normal) fall back to the dominant delta axis. rough.js then sketches the
 * straight segments for the hand-drawn look.
 *
 * `startTrim`/`endTrim` shorten the first/last leg along its own axis (issue
 * #59: stop the shaft at an arrowhead's base). Corners are computed from the
 * true endpoints first, so trimming never moves the mid-rail; each trim is
 * clamped to its leg's length so the leg stops at its corner instead of
 * inverting past it.
 */
export function buildElbowPath(
  ep: Endpoints,
  startTrim = 0,
  endTrim = 0,
): string {
  const { start: s, end: e, startNormal: sn, endNormal: en } = ep;
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  // Does the path leave/enter on a vertical axis (top/bottom socket)?
  const startVertical =
    sn.y !== 0 || (sn.x === 0 && Math.abs(dy) >= Math.abs(dx));
  const endVertical =
    en.y !== 0 || (en.x === 0 && Math.abs(dy) >= Math.abs(dx));

  let pts: Point[];
  if (startVertical && endVertical) {
    const midY = (s.y + e.y) / 2;
    pts = [s, { x: s.x, y: midY }, { x: e.x, y: midY }, e];
  } else if (!startVertical && !endVertical) {
    const midX = (s.x + e.x) / 2;
    pts = [s, { x: midX, y: s.y }, { x: midX, y: e.y }, e];
  } else if (startVertical) {
    // leave vertically, arrive horizontally → corner under the start
    pts = [s, { x: s.x, y: e.y }, e];
  } else {
    // leave horizontally, arrive vertically → corner over the end
    pts = [s, { x: e.x, y: s.y }, e];
  }

  if (startTrim > 0) trimLeg(pts, 0, 1, startTrim);
  if (endTrim > 0) trimLeg(pts, pts.length - 1, pts.length - 2, endTrim);

  return (
    `M ${r(pts[0]!.x)} ${r(pts[0]!.y)}` +
    pts
      .slice(1)
      .map((p) => ` L ${r(p.x)} ${r(p.y)}`)
      .join('')
  );
}

/** Move pts[i] toward pts[j] by `by`, clamped to that leg's length. */
function trimLeg(pts: Point[], i: number, j: number, by: number): void {
  const a = pts[i]!;
  const b = pts[j]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return;
  const k = Math.min(by, len) / len;
  pts[i] = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Axis-aligned box, in the same coordinate space as the endpoints. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RouteBellies {
  b1: Point;
  b2: Point;
}

/**
 * Per-control-point displacements to bow the rendered curve clear of blocking
 * boxes. Detection runs against samples of the actual cubic (not the straight
 * chord), so a box the chord clears but the bow clips is still caught. The
 * correction for the worst penetration is split across the two control points
 * by their Bézier basis weights at the blocker's parameter, so end-adjacent
 * obstacles push the near control hard instead of bowing the middle. Iterates
 * apply → resample → recheck until clear (or a bounded best-effort cap for
 * geometry no single cubic can clear). Still a pragmatic single-cubic router,
 * not a path-finder.
 */
export function routeBellies(
  ep: Endpoints,
  curvature: number,
  obstacles: Box[],
  padding = 14,
): RouteBellies {
  const b1: Point = { x: 0, y: 0 };
  const b2: Point = { x: 0, y: 0 };
  if (!obstacles.length) return { b1, b2 };

  const len = Math.hypot(ep.end.x - ep.start.x, ep.end.y - ep.start.y) || 1;
  const n = unitNormal(ep.start, ep.end); // left-hand normal: the push axis
  const cap = 1.5 * len; // best-effort ceiling for unclearable geometry
  const MAX_ITER = 4;

  // Per-obstacle geometry never changes between iterations — hoist it out of
  // the resample loop. `clearance` folds the box half-extent projected onto
  // the push axis plus the padding.
  const obs = obstacles.map((b) => ({
    cx: b.left + b.width / 2,
    cy: b.top + b.height / 2,
    minX: b.left - padding,
    maxX: b.left + b.width + padding,
    minY: b.top - padding,
    maxY: b.top + b.height + padding,
    clearance:
      Math.abs((b.width / 2) * n.x) + Math.abs((b.height / 2) * n.y) + padding,
  }));

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const pts = samplePath(ep, curvature, b1, b2);
    const last = pts.length - 1;

    // Worst penetration across all obstacles × interior samples. The exact
    // endpoint samples are excluded: they sit on the anchors, which no belly
    // can move — including them would divide by vanishing basis weights.
    let worstDepth = 0;
    let worstT = 0;
    let worstSign = 1;
    for (const o of obs) {
      for (let i = 1; i < last; i++) {
        const p = pts[i]!;
        if (p.x <= o.minX || p.x >= o.maxX || p.y <= o.minY || p.y >= o.maxY)
          continue; // sample outside the padded box
        const s = (p.x - o.cx) * n.x + (p.y - o.cy) * n.y;
        const depth = o.clearance - Math.abs(s);
        if (depth > worstDepth) {
          worstDepth = depth;
          worstT = i / last;
          worstSign = s >= 0 ? 1 : -1; // push further out the side it's on
        }
      }
    }
    if (worstDepth <= 0) break; // curve clears everything

    // Least-norm split of the correction across b1/b2 by basis weight at t*,
    // with t* clamped to the interior so the weights can't vanish (endpoint
    // singularity guard).
    const t = Math.min(0.95, Math.max(0.05, worstT));
    const w1 = 3 * t * (1 - t) * (1 - t);
    const w2 = 3 * t * t * (1 - t);
    // +2px overshoot so float noise doesn't leave a sample kissing the box.
    const k = ((worstDepth + 2) * worstSign) / (w1 * w1 + w2 * w2);
    b1.x += n.x * k * w1;
    b1.y += n.y * k * w1;
    b2.x += n.x * k * w2;
    b2.y += n.y * k * w2;

    // Magnitude cap only, not a full solver — geometry no single cubic can
    // clear exits here as best-effort.
    for (const b of [b1, b2]) {
      const m = Math.hypot(b.x, b.y);
      if (m > cap) {
        b.x = (b.x / m) * cap;
        b.y = (b.y / m) * cap;
      }
    }
  }
  return { b1, b2 };
}

/** Half-angle of the arrowhead's V. Shared with headBaseInset so the shaft
 * inset lands exactly on the head's base. */
const HEAD_SPREAD = Math.PI / 7;

/** Depth of the arrowhead's base behind its tip, along the aim direction. */
export function headBaseInset(size: number): number {
  return size * Math.cos(HEAD_SPREAD);
}

/** Two short strokes forming an arrowhead at `tip`, opening along `dir`.
 * `closed` appends `Z` for a fillable triangle (solid head style). */
export function arrowHeadPath(
  tip: Point,
  dir: Point,
  size: number,
  closed = false,
): string {
  const a = Math.atan2(dir.y, dir.x);
  const spread = HEAD_SPREAD;
  const p1 = {
    x: tip.x - size * Math.cos(a - spread),
    y: tip.y - size * Math.sin(a - spread),
  };
  const p2 = {
    x: tip.x - size * Math.cos(a + spread),
    y: tip.y - size * Math.sin(a + spread),
  };
  const d = `M ${r(p1.x)} ${r(p1.y)} L ${r(tip.x)} ${r(tip.y)} L ${r(p2.x)} ${r(p2.y)}`;
  return closed ? `${d} Z` : d;
}

/**
 * Pull the endpoints back along their tangents so the shaft terminates at an
 * arrowhead's base instead of running into its tip (issue #59). The moved
 * point is `p - tangent * inset` — for a side socket that is `p + normal *
 * inset`, back along the arrival/departure path. Normals are preserved so
 * cubicControls still bows the curve off the socket edges. When the summed
 * insets would eat more than half the chord (tiny arrows), both scale down
 * proportionally so the shaft keeps at least half the chord and the endpoints
 * never cross. Curve route only — the elbow route trims its legs instead
 * (see buildElbowPath).
 */
export function insetEndpoints(
  ep: Endpoints,
  startInset: number,
  endInset: number,
): Endpoints {
  const total = startInset + endInset;
  if (total <= 0) return ep;
  const chord = Math.hypot(ep.end.x - ep.start.x, ep.end.y - ep.start.y);
  const scale = Math.min(1, chord / 2 / total);
  const st = startTangent(ep);
  const et = endTangent(ep);
  const si = startInset * scale;
  const ei = endInset * scale;
  return {
    start: { x: ep.start.x - st.x * si, y: ep.start.y - st.y * si },
    end: { x: ep.end.x - et.x * ei, y: ep.end.y - et.y * ei },
    startNormal: ep.startNormal,
    endNormal: ep.endNormal,
  };
}

/** Tangent direction of the cubic at its end, for aiming the arrowhead. */
export function endTangent(ep: Endpoints): Point {
  // Curve arrives along the inverse of the end normal; good enough and stable.
  const { end, endNormal } = ep;
  if (endNormal.x || endNormal.y)
    return { x: -endNormal.x + 0, y: -endNormal.y + 0 };
  return unit(end.x - ep.start.x, end.y - ep.start.y);
}

export function startTangent(ep: Endpoints): Point {
  const { startNormal } = ep;
  if (startNormal.x || startNormal.y)
    return { x: -startNormal.x + 0, y: -startNormal.y + 0 };
  return unit(ep.start.x - ep.end.x, ep.start.y - ep.end.y);
}

/**
 * Left-hand unit normal of the segment a→b (the draw direction). Used to push
 * a label off the line. Returns {0,0} for a degenerate zero-length segment.
 */
export function unitNormal(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const m = Math.hypot(dx, dy);
  if (m === 0) return { x: 0, y: 0 };
  // Rotate the unit tangent 90° CCW: (dx,dy) -> (dy,-dx) in screen coords
  // (y down), which points to the left of the travel direction.
  return { x: dy / m + 0, y: -dx / m + 0 };
}

function unit(x: number, y: number): Point {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}
