import { clamp01 } from './progress';
import type { LabelPosition } from './types';

export type SegmentKind = 'line' | 'head';

const LABEL_KEYWORDS: Record<string, number> = {
  start: 0,
  middle: 0.5,
  end: 1,
};

/**
 * Resolve any accepted `labelAt` form to a clamped `0..1` fraction:
 * - `'start' | 'middle' | 'end'` keywords;
 * - a number (clamped);
 * - a `'<n>%'` percentage string.
 * Malformed input falls back to `fallback` rather than throwing, matching the
 * library's clamp-don't-throw style.
 */
export function resolveLabelAt(
  value: LabelPosition | undefined,
  fallback = 0.5,
): number {
  if (value == null) return fallback;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? clamp01(value) : fallback;
  }
  const key = value.trim().toLowerCase();
  const keyword = LABEL_KEYWORDS[key];
  if (keyword !== undefined) return keyword;
  if (key.endsWith('%')) {
    const n = Number.parseFloat(key.slice(0, -1));
    return Number.isFinite(n) ? clamp01(n / 100) : fallback;
  }
  return fallback;
}

export interface DrawSegment {
  len: number;
  kind: SegmentKind;
}

/**
 * Given the line/head segments and an eased progress (0..1), return the
 * `stroke-dashoffset` each segment should have.
 *
 * Line sub-strokes (rough.js emits 1-2 overlapping ones) share a single
 * leading edge so they grow together as one pen tip. Arrowhead strokes only
 * begin once the line is fully drawn, then reveal sequentially.
 */
function lengths(segs: DrawSegment[]): { lineLen: number; headLen: number } {
  let lineLen = 0;
  let headLen = 0;
  for (const s of segs) {
    if (s.kind === 'line') lineLen = Math.max(lineLen, s.len);
    else headLen += s.len;
  }
  return { lineLen, headLen };
}

export function dashOffsets(segs: DrawSegment[], eased: number): number[] {
  const { lineLen, headLen } = lengths(segs);
  const total = lineLen + headLen || 1;
  const drawn = clamp01(eased) * total;

  const lp = lineLen > 0 ? clamp01(drawn / lineLen) : 1;
  let headDrawn = Math.max(0, drawn - lineLen);

  return segs.map((seg) => {
    if (seg.kind === 'line') return seg.len * (1 - lp);
    const show = Math.max(0, Math.min(seg.len, headDrawn));
    headDrawn -= seg.len;
    return seg.len - show;
  });
}

/** How far the pen tip has travelled along the line, 0..1. */
export function lineProgress(segs: DrawSegment[], eased: number): number {
  const { lineLen, headLen } = lengths(segs);
  const total = lineLen + headLen || 1;
  const drawn = clamp01(eased) * total;
  return lineLen > 0 ? clamp01(drawn / lineLen) : 1;
}

/**
 * Label opacity: 0 until the pen reaches `labelAt`, then ramps to 1 over a
 * short `fade` window so the label appears as the line is drawn through it.
 *
 * The ramp start is clamped so the window always fits within `[0, 1]`. Without
 * this an end-anchored label (`labelAt` 1, or anything within `fade` of the
 * end) could never reach full opacity — `lineProg` tops out at 1, so it would
 * stay invisible. Interior labels keep their trailing fade unchanged.
 */
export function labelOpacity(
  lineProg: number,
  labelAt: number,
  fade = 0.08,
): number {
  const start = Math.min(clamp01(labelAt), 1 - fade);
  return clamp01((lineProg - start) / (fade || 1));
}
