import type { Point } from './types';
import { docRect, type DocRect } from './geometry';

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Progress 0..1 of `targetTop` moving up through the viewport, mapped onto the
 * draw window `[enter, leave]` (fractions of viewport height, enter > leave).
 */
export function scrollProgress(
  targetRect: DocRect,
  range: [number, number],
): number {
  const vh = window.innerHeight || 1;
  // Target top, in viewport-fraction terms (0 = top of viewport, 1 = bottom).
  const topFrac = (targetRect.top - window.scrollY) / vh;
  const [enter, leave] = range;
  return clamp01((enter - topFrac) / (enter - leave || 1));
}

/** A synthetic rect centered between two elements, for the default target. */
export function midpointRect(a: Element, b: Element): DocRect {
  const ra = docRect(a);
  const rb = docRect(b);
  const ca: Point = { x: ra.left + ra.width / 2, y: ra.top + ra.height / 2 };
  const cb: Point = { x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 };
  return {
    left: (ca.x + cb.x) / 2,
    top: (ca.y + cb.y) / 2,
    width: 0,
    height: 0,
  };
}
