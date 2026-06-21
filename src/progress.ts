import type { Point } from './types';
import { docRect, type DocRect } from './geometry';

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * True when the user has asked the OS to reduce motion. Guarded so it degrades
 * to `false` (animate normally) wherever `matchMedia` is unavailable — SSR,
 * older or headless environments.
 */
export function prefersReducedMotion(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

/** A draw window within a group's 0..1 progress for one arrow. */
export interface StaggerWindow {
  start: number;
  span: number;
}

/**
 * Slice `[0,1]` into one draw window per arrow given a `stagger` of 0..1.
 * `stagger = 1` => non-overlapping equal slices (fully sequential).
 * `stagger = 0` => every window is the full `[0,1]` (all draw together).
 */
export function staggerWindows(n: number, stagger: number): StaggerWindow[] {
  if (n <= 0) return [];
  const s = clamp01(stagger);
  // span chosen so the last window ends exactly at 1: span * (1 + (n-1)*s) = 1.
  const span = 1 / (1 + (n - 1) * s);
  const step = span * s;
  return Array.from({ length: n }, (_, i) => ({ start: i * step, span }));
}

/** Map overall progress `p` into a single window's local 0..1 progress. */
export function windowProgress(p: number, w: StaggerWindow): number {
  if (w.span <= 0) return p > w.start ? 1 : 0;
  return clamp01((p - w.start) / w.span);
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
