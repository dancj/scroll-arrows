import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScrollArrow } from '../src/scroll-arrow';

/**
 * jsdom has no real ResizeObserver/IntersectionObserver and no SVG geometry
 * (getTotalLength/getBBox). The successful draw path is exercised in a real
 * browser via the demo; these tests cover the hidden-anchor bail (issue #21),
 * which returns before any SVG measurement, so it runs cleanly under jsdom.
 */

type IOInstance = {
  cb: IntersectionObserverCallback;
  observed: Element[];
  disconnected: boolean;
};

let ioInstances: IOInstance[];

function boxed(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 0, height: 0, ...rect }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  ioInstances = [];
  // @ts-expect-error -- minimal stub for jsdom
  global.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  // @ts-expect-error -- minimal stub for jsdom
  global.IntersectionObserver = class {
    observed: Element[] = [];
    disconnected = false;
    constructor(public cb: IntersectionObserverCallback) {
      ioInstances.push(this as unknown as IOInstance);
    }
    observe(el: Element): void {
      this.observed.push(el);
    }
    unobserve(): void {}
    disconnect(): void {
      this.disconnected = true;
    }
  };
});

afterEach(() => {
  document.body.innerHTML = '';
  // @ts-expect-error -- clean up stubs
  delete global.ResizeObserver;
  // @ts-expect-error -- clean up stubs
  delete global.IntersectionObserver;
});

describe('ScrollArrow with a hidden / zero-size anchor', () => {
  it('draws nothing instead of a degenerate arrow', () => {
    const start = boxed({ width: 0, height: 0 }); // display:none anchor
    const end = boxed({ left: 200, top: 200, width: 100, height: 40 });

    expect(() => new ScrollArrow({ start, end })).not.toThrow();
    // No path emitted — an empty group beats a collapsed/NaN arrow.
    expect(document.querySelectorAll('path').length).toBe(0);
  });

  it('arms an IntersectionObserver watching both anchors for reveal', () => {
    const start = boxed({ width: 0, height: 0 });
    const end = boxed({ left: 200, top: 200, width: 100, height: 40 });

    new ScrollArrow({ start, end });

    expect(ioInstances).toHaveLength(1);
    expect(ioInstances[0].observed).toContain(start);
    expect(ioInstances[0].observed).toContain(end);
  });

  it('disconnects the reveal observer on destroy()', () => {
    const start = boxed({ width: 0, height: 0 });
    const end = boxed({ left: 200, top: 200, width: 100, height: 40 });

    const arrow = new ScrollArrow({ start, end });
    arrow.destroy();

    expect(ioInstances[0].disconnected).toBe(true);
  });

  it('does not arm an observer when both anchors are already laid out', () => {
    // Both visible → degenerate check passes → would draw. jsdom lacks SVG
    // geometry, so the draw throws; assert the throw happens AFTER the
    // no-observer decision by checking no IntersectionObserver was created.
    const start = boxed({ left: 0, top: 0, width: 100, height: 40 });
    const end = boxed({ left: 200, top: 200, width: 100, height: 40 });

    try {
      new ScrollArrow({ start, end });
    } catch {
      /* jsdom getTotalLength gap — expected, irrelevant to this assertion */
    }
    expect(ioInstances).toHaveLength(0);
  });

  it('does not throw when IntersectionObserver is unavailable', () => {
    // @ts-expect-error -- simulate an engine without IntersectionObserver
    delete global.IntersectionObserver;
    const start = boxed({ width: 0, height: 0 });
    const end = boxed({ left: 200, top: 200, width: 100, height: 40 });

    expect(() => new ScrollArrow({ start, end })).not.toThrow();
  });
});
