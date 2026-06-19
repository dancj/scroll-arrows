import type { Point, Socket } from "./types";

const SIDES: Exclude<Socket, "auto" | "center">[] = [
  "top",
  "bottom",
  "left",
  "right",
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

function center(r: DocRect): Point {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** The anchor point on a given edge of a rect. */
function socketPoint(r: DocRect, side: Socket): Point {
  const c = center(r);
  switch (side) {
    case "top":
      return { x: c.x, y: r.top };
    case "bottom":
      return { x: c.x, y: r.top + r.height };
    case "left":
      return { x: r.left, y: c.y };
    case "right":
      return { x: r.left + r.width, y: c.y };
    default:
      return c;
  }
}

/** Outward unit normal for an edge — direction the curve should leave/enter. */
function socketNormal(side: Socket): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

/** Pick the edge whose anchor sits closest to the other element's center. */
function autoSide(self: DocRect, other: DocRect): Socket {
  const target = center(other);
  let best: Socket = "right";
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
): Endpoints {
  const s = startSocket === "auto" ? autoSide(startRect, endRect) : startSocket;
  const e = endSocket === "auto" ? autoSide(endRect, startRect) : endSocket;
  return {
    start: socketPoint(startRect, s),
    end: socketPoint(endRect, e),
    startNormal: socketNormal(s),
    endNormal: socketNormal(e),
  };
}

/**
 * Build a cubic-bezier `d` string between endpoints. Control points are pushed
 * out along each socket normal so the curve leaves/enters edges cleanly.
 * `curvature` (0..~1) scales how far the controls bow out.
 */
export function buildPath(ep: Endpoints, curvature: number): string {
  const { start, end, startNormal, endNormal } = ep;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy) || 1;
  const reach = dist * (0.3 + curvature * 0.4);

  // If a normal is zero (center socket), fall back to the straight direction.
  const sn = startNormal.x || startNormal.y ? startNormal : unit(dx, dy);
  const en = endNormal.x || endNormal.y ? endNormal : unit(-dx, -dy);

  const c1 = { x: start.x + sn.x * reach, y: start.y + sn.y * reach };
  const c2 = { x: end.x + en.x * reach, y: end.y + en.y * reach };

  return `M ${r(start.x)} ${r(start.y)} C ${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(end.x)} ${r(end.y)}`;
}

/** Two short strokes forming an arrowhead at `tip`, opening along `dir`. */
export function arrowHeadPath(tip: Point, dir: Point, size: number): string {
  const a = Math.atan2(dir.y, dir.x);
  const spread = Math.PI / 7;
  const p1 = {
    x: tip.x - size * Math.cos(a - spread),
    y: tip.y - size * Math.sin(a - spread),
  };
  const p2 = {
    x: tip.x - size * Math.cos(a + spread),
    y: tip.y - size * Math.sin(a + spread),
  };
  return `M ${r(p1.x)} ${r(p1.y)} L ${r(tip.x)} ${r(tip.y)} L ${r(p2.x)} ${r(p2.y)}`;
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
