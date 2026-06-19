import { describe, it, expect, beforeEach } from 'vitest';
import { easeInOutCubic, clamp01, scrollProgress } from '../src/progress';
import type { DocRect } from '../src/geometry';

describe('clamp01', () => {
  it('clamps below 0 and above 1', () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});

describe('easeInOutCubic', () => {
  it('pins endpoints and the midpoint', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });

  it('is symmetric around the midpoint', () => {
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1);
  });
});

describe('scrollProgress', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      value: 1000,
      configurable: true,
    });
    window.scrollY = 0;
  });

  const rect = (docTop: number): DocRect => ({
    left: 0,
    top: docTop,
    width: 10,
    height: 10,
  });

  it('is 0 when the target sits below the enter line', () => {
    // enter 0.85 -> 850px. Target top at 900px is still below it.
    expect(scrollProgress(rect(900), [0.85, 0.35])).toBe(0);
  });

  it('is 1 when the target has passed the leave line', () => {
    // leave 0.35 -> 350px. Target top at 100px is above it.
    expect(scrollProgress(rect(100), [0.85, 0.35])).toBe(1);
  });

  it('interpolates linearly between enter and leave', () => {
    // top at 600px -> fraction 0.6; window [0.85,0.35] -> (0.85-0.6)/0.5 = 0.5
    expect(scrollProgress(rect(600), [0.85, 0.35])).toBeCloseTo(0.5);
  });

  it('accounts for window scroll offset', () => {
    window.scrollY = 500;
    // doc top 1100 -> viewport top 600 -> same 0.5 as above
    expect(scrollProgress(rect(1100), [0.85, 0.35])).toBeCloseTo(0.5);
  });
});
