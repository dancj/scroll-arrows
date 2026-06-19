import { describe, it, expect } from "vitest";
import {
  dashOffsets,
  lineProgress,
  labelOpacity,
  type DrawSegment,
} from "../src/draw";

const line2: DrawSegment[] = [
  { len: 100, kind: "line" },
  { len: 100, kind: "line" },
];
// two overlapping line strokes (100) + one arrowhead (20)
const withHead: DrawSegment[] = [...line2, { len: 20, kind: "head" }];

describe("dashOffsets", () => {
  it("hides everything at progress 0", () => {
    expect(dashOffsets(withHead, 0)).toEqual([100, 100, 20]);
  });

  it("reveals everything at progress 1", () => {
    expect(dashOffsets(withHead, 1)).toEqual([0, 0, 0]);
  });

  it("advances both line sub-strokes by the SAME leading fraction", () => {
    // total = lineLen(100) + headLen(20) = 120. At eased=0.5 -> drawn 60.
    // lineProgress = 60/100 = 0.6 -> offset 40 on each line stroke; head untouched.
    const [a, b, h] = dashOffsets(withHead, 0.5);
    expect(a).toBe(b); // <-- the headline fix: shared leading edge
    expect(a).toBeCloseTo(40);
    expect(h).toBe(20); // head not started until line done
  });

  it("starts the head only after the line is fully drawn", () => {
    // line finishes at eased = 100/120 ≈ 0.8333. Just past that, head begins.
    const justAfter = dashOffsets(withHead, 100 / 120 + 0.5 / 120);
    expect(justAfter[0]).toBe(0); // line complete
    expect(justAfter[1]).toBe(0);
    expect(justAfter[2]).toBeCloseTo(19.5); // head 0.5px in
  });

  it("treats a headless arrow as pure line", () => {
    expect(dashOffsets(line2, 0.5)).toEqual([50, 50]);
  });

  it("reveals multiple heads sequentially, not in parallel", () => {
    const twoHeads: DrawSegment[] = [
      { len: 100, kind: "line" },
      { len: 10, kind: "head" },
      { len: 10, kind: "head" },
    ];
    // total 120, eased so drawn = 115 -> head budget 15: first head full (10),
    // second head 5 in.
    const [, h1, h2] = dashOffsets(twoHeads, 115 / 120);
    expect(h1).toBe(0); // first head complete
    expect(h2).toBeCloseTo(5); // second head halfway
  });

  it("clamps out-of-range progress", () => {
    expect(dashOffsets(line2, -1)).toEqual([100, 100]);
    expect(dashOffsets(line2, 2)).toEqual([0, 0]);
  });

  it("handles empty input without dividing by zero", () => {
    expect(dashOffsets([], 0.5)).toEqual([]);
  });
});

describe("lineProgress", () => {
  it("reaches 1 before overall progress (line finishes before head)", () => {
    // line 100, head 20 -> line done at eased 100/120
    expect(lineProgress(withHead, 100 / 120)).toBeCloseTo(1);
    expect(lineProgress(withHead, 0.5)).toBeCloseTo(0.6); // 60/100
  });

  it("is full for a headless line at progress 1", () => {
    expect(lineProgress(line2, 1)).toBe(1);
  });
});

describe("labelOpacity", () => {
  it("is 0 before the pen reaches the label", () => {
    expect(labelOpacity(0.3, 0.5)).toBe(0);
  });

  it("ramps to 1 across the fade window after the pen passes", () => {
    expect(labelOpacity(0.5, 0.5)).toBe(0); // just arriving
    expect(labelOpacity(0.54, 0.5, 0.08)).toBeCloseTo(0.5); // halfway through fade
    expect(labelOpacity(0.6, 0.5, 0.08)).toBe(1); // fully past
  });

  it("clamps the label position", () => {
    expect(labelOpacity(1, 2)).toBe(0); // labelAt clamped to 1, pen never past
    expect(labelOpacity(0.5, -1)).toBe(1); // labelAt clamped to 0, pen well past
  });
});
