import { clamp01 } from "./progress";

export type SegmentKind = "line" | "head";

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
    if (s.kind === "line") lineLen = Math.max(lineLen, s.len);
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
    if (seg.kind === "line") return seg.len * (1 - lp);
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
 */
export function labelOpacity(
  lineProg: number,
  labelAt: number,
  fade = 0.08,
): number {
  return clamp01((lineProg - clamp01(labelAt)) / (fade || 1));
}
