import { describe, it, expect } from "vitest";
import { mapRoughness, deriveSeed } from "../src/roughness";

describe("mapRoughness", () => {
  it("maps 0 to a clean single stroke", () => {
    const { rough, curvature } = mapRoughness(0, undefined, "#000", 2, 1);
    expect(rough.roughness).toBe(0);
    expect(rough.bowing).toBe(0);
    expect(rough.disableMultiStroke).toBe(true);
    expect(rough.preserveVertices).toBe(true);
    expect(curvature).toBe(0);
  });

  it("maps 1 to a scratchy multi-stroke with bow", () => {
    const { rough, curvature } = mapRoughness(1, undefined, "#000", 2, 1);
    expect(rough.roughness).toBeCloseTo(3.5);
    expect(rough.bowing).toBeCloseTo(3);
    expect(rough.disableMultiStroke).toBe(false);
    expect(curvature).toBeCloseTo(0.6);
  });

  it("clamps out-of-range input", () => {
    expect(mapRoughness(5, undefined, "#000", 2, 1).rough.roughness).toBeCloseTo(
      3.5,
    );
    expect(mapRoughness(-5, undefined, "#000", 2, 1).rough.roughness).toBe(0);
  });

  it("lets an explicit curvature override the derived one", () => {
    expect(mapRoughness(1, 0.1, "#000", 2, 1).curvature).toBe(0.1);
  });

  it("passes stroke + width + seed straight through", () => {
    const { rough } = mapRoughness(0.5, undefined, "#f00", 4, 42);
    expect(rough.stroke).toBe("#f00");
    expect(rough.strokeWidth).toBe(4);
    expect(rough.seed).toBe(42);
    expect(rough.fill).toBe("none");
  });
});

describe("deriveSeed", () => {
  it("is deterministic for the same inputs", () => {
    expect(deriveSeed("#a", "#b")).toBe(deriveSeed("#a", "#b"));
  });

  it("differs by direction", () => {
    expect(deriveSeed("#a", "#b")).not.toBe(deriveSeed("#b", "#a"));
  });

  it("stays inside the seed range", () => {
    const s = deriveSeed("some-long-selector", "another-one");
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(100000);
  });
});
