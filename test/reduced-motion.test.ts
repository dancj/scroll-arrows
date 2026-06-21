import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScrollArrow } from '../src/scroll-arrow';
import { ScrollArrowGroup } from '../src/group';

/**
 * ScrollArrow/ScrollArrowGroup are DOM-heavy (real SVG geometry needs a
 * browser), so these tests stub just enough of the platform to exercise the
 * reduced-motion decision: matchMedia, ResizeObserver, and path length.
 */

let originalMatchMedia: typeof window.matchMedia;
let originalRO: typeof globalThis.ResizeObserver;
let observed: Element[] = [];

/** Make an element report a non-zero rect so endpoint math has real points. */
function boxed(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 10, height: 10, ...rect }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function setReducedMotion(matches: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as never;
}

/** Every drawn segment's dashoffset is 0 once fully revealed. */
function fullyDrawn(svg: SVGSVGElement): boolean {
  const paths = svg.querySelectorAll('path');
  if (paths.length === 0) return false;
  return Array.from(paths).every(
    (p) => (p as SVGPathElement).style.strokeDashoffset === '0',
  );
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  originalRO = globalThis.ResizeObserver;
  observed = [];

  // jsdom has no ResizeObserver.
  globalThis.ResizeObserver = class {
    observe(el: Element): void {
      observed.push(el);
    }
    unobserve(): void {}
    disconnect(): void {}
  } as never;

  // jsdom does not implement SVG path geometry.
  (
    SVGElement.prototype as unknown as { getTotalLength: () => number }
  ).getTotalLength = () => 100;
});

afterEach(() => {
  if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  // @ts-expect-error - restore jsdom's absent state when there was none
  else delete window.matchMedia;
  globalThis.ResizeObserver = originalRO;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('ScrollArrow reduced motion', () => {
  it('renders fully drawn and static when the user prefers reduced motion', () => {
    setReducedMotion(true);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const start = boxed({ left: 0, top: 0 });
    const end = boxed({ left: 200, top: 200 });

    const arrow = new ScrollArrow({ start, end });

    // Fully drawn without any scroll event.
    const svg = document.querySelector('svg[data-scroll-arrows]')!;
    expect(fullyDrawn(svg as SVGSVGElement)).toBe(true);
    // No scroll listener attached.
    expect(addSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(false);
    arrow.destroy();
  });

  it('still tracks layout via ResizeObserver under reduced motion', () => {
    setReducedMotion(true);
    const start = boxed({ left: 0, top: 0 });
    const end = boxed({ left: 200, top: 200 });

    const arrow = new ScrollArrow({ start, end });
    // start + end observed for layout tracking.
    expect(observed).toContain(start);
    expect(observed).toContain(end);
    arrow.destroy();
  });

  it('keeps the scroll animation when respectReducedMotion is false', () => {
    setReducedMotion(true);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const start = boxed({ left: 0, top: 0 });
    const end = boxed({ left: 200, top: 200 });

    const arrow = new ScrollArrow({
      start,
      end,
      respectReducedMotion: false,
    });

    // Opting out restores the scroll-driven path: a scroll listener is bound,
    // so the draw follows scroll position rather than being forced complete.
    expect(addSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    arrow.destroy();
  });

  it('animates normally when no reduced-motion preference is set', () => {
    setReducedMotion(false);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const start = boxed({ left: 0, top: 0 });
    const end = boxed({ left: 200, top: 200 });

    const arrow = new ScrollArrow({ start, end });
    expect(addSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    arrow.destroy();
  });

  it('overrides an explicit progress:0 to fully drawn under reduced motion', () => {
    setReducedMotion(true);
    const start = boxed({ left: 0, top: 0 });
    const end = boxed({ left: 200, top: 200 });

    const arrow = new ScrollArrow({ start, end, progress: 0 });
    const svg = document.querySelector('svg[data-scroll-arrows]')!;
    expect(fullyDrawn(svg as SVGSVGElement)).toBe(true);
    arrow.destroy();
  });
});

describe('ScrollArrowGroup reduced motion', () => {
  it('renders every arrow fully drawn and static under reduced motion', () => {
    setReducedMotion(true);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const a1 = boxed({ left: 0, top: 0 });
    const a2 = boxed({ left: 100, top: 100 });
    const a3 = boxed({ left: 200, top: 200 });

    const group = new ScrollArrowGroup({
      arrows: [
        { start: a1, end: a2 },
        { start: a2, end: a3 },
        { start: a1, end: a3 },
      ],
    });

    const svg = document.querySelector('svg[data-scroll-arrows]')!;
    expect(fullyDrawn(svg as SVGSVGElement)).toBe(true);
    expect(addSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(false);
    group.destroy();
  });

  it('keeps the staggered reveal when respectReducedMotion is false', () => {
    setReducedMotion(true);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const a1 = boxed({ left: 0, top: 0 });
    const a2 = boxed({ left: 100, top: 100 });

    const group = new ScrollArrowGroup({
      arrows: [
        { start: a1, end: a2 },
        { start: a2, end: a1 },
      ],
      respectReducedMotion: false,
    });

    expect(addSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    group.destroy();
  });
});
