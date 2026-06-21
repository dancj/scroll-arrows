import { describe, it, expect } from 'vitest';
import { staggerWindows, windowProgress } from '../src/progress';

describe('staggerWindows', () => {
  it('returns no windows for a non-positive count', () => {
    expect(staggerWindows(0, 1)).toEqual([]);
    expect(staggerWindows(-1, 1)).toEqual([]);
  });

  it('gives a single arrow the full window regardless of stagger', () => {
    expect(staggerWindows(1, 1)).toEqual([{ start: 0, span: 1 }]);
    expect(staggerWindows(1, 0)).toEqual([{ start: 0, span: 1 }]);
  });

  it('stagger=1 makes equal non-overlapping slices that tile [0,1]', () => {
    const w = staggerWindows(4, 1);
    expect(w).toEqual([
      { start: 0, span: 0.25 },
      { start: 0.25, span: 0.25 },
      { start: 0.5, span: 0.25 },
      { start: 0.75, span: 0.25 },
    ]);
    // Last window ends exactly at 1.
    const last = w[w.length - 1];
    expect(last.start + last.span).toBeCloseTo(1);
  });

  it('stagger=0 overlaps every window onto the full range', () => {
    const w = staggerWindows(3, 0);
    for (const win of w) {
      expect(win.start).toBe(0);
      expect(win.span).toBe(1);
    }
  });

  it('partial stagger overlaps slices but still ends at 1', () => {
    const n = 5;
    const w = staggerWindows(n, 0.5);
    // Spans are equal and starts strictly increase.
    for (let i = 1; i < n; i++) {
      expect(w[i].span).toBeCloseTo(w[0].span);
      expect(w[i].start).toBeGreaterThan(w[i - 1].start);
    }
    const last = w[n - 1];
    expect(last.start + last.span).toBeCloseTo(1);
    // Overlap: each start lands before the previous window ends.
    expect(w[1].start).toBeLessThan(w[0].start + w[0].span);
  });
});

describe('windowProgress', () => {
  const w = { start: 0.25, span: 0.5 }; // covers [0.25, 0.75]

  it('clamps to 0 before the window opens', () => {
    expect(windowProgress(0, w)).toBe(0);
    expect(windowProgress(0.25, w)).toBe(0);
  });

  it('clamps to 1 after the window closes', () => {
    expect(windowProgress(0.75, w)).toBe(1);
    expect(windowProgress(1, w)).toBe(1);
  });

  it('maps linearly inside the window', () => {
    expect(windowProgress(0.5, w)).toBeCloseTo(0.5);
    expect(windowProgress(0.375, w)).toBeCloseTo(0.25);
  });

  it('treats a zero-span window as fully drawn once reached', () => {
    expect(windowProgress(0.5, { start: 0.5, span: 0 })).toBe(0);
    expect(windowProgress(0.6, { start: 0.5, span: 0 })).toBe(1);
  });
});
