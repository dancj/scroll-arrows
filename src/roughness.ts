import type { Options as RoughOptions } from "roughjs/bin/core";

/**
 * Map the single normalized `roughness` knob (0 clean .. 1 scratchy) onto the
 * roughjs option soup plus our own path curvature.
 */
export function mapRoughness(
  roughness: number,
  curvatureOverride: number | undefined,
  stroke: string,
  strokeWidth: number,
  seed: number,
): { rough: RoughOptions; curvature: number } {
  const r = clamp01(roughness);
  return {
    curvature: curvatureOverride ?? r * 0.6,
    rough: {
      roughness: r * 3.5,
      bowing: r * 3,
      maxRandomnessOffset: r * 4,
      // Clean end of the spectrum: a single, near-exact stroke.
      disableMultiStroke: r < 0.15,
      preserveVertices: r < 0.15,
      stroke,
      strokeWidth,
      seed: seed | 0,
      fill: "none",
    },
  };
}

/** Stable-ish seed from the two element references so scribbles don't reshuffle. */
export function deriveSeed(a: string, b: string): number {
  let h = 2166136261;
  const s = a + "->" + b;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
