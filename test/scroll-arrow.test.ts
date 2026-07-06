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

describe('ScrollArrow avoid routing', () => {
  // jsdom does not implement SVG path geometry; stub it (mirroring
  // reduced-motion.test.ts) so construction completes and a genuine error
  // fails the test loudly. rough.js output is deterministic for a fixed
  // seed, so the rendered `d` in the DOM is a faithful witness of the
  // geometry the router produced.
  beforeEach(() => {
    (
      SVGElement.prototype as unknown as { getTotalLength: () => number }
    ).getTotalLength = () => 100;
  });
  afterEach(() => {
    delete (SVGElement.prototype as unknown as { getTotalLength?: unknown })
      .getTotalLength;
  });

  function lineD(opts: ConstructorParameters<typeof ScrollArrow>[0]): string {
    new ScrollArrow(opts);
    const d = document.querySelector('svg path')?.getAttribute('d') ?? '';
    document.querySelectorAll('svg').forEach((s) => s.remove());
    return d;
  }

  it('bends the curve when an avoided obstacle blocks it', () => {
    const start = boxed({ left: 0, top: 0, width: 100, height: 40 });
    const end = boxed({ left: 300, top: 0, width: 100, height: 40 });
    // Straddles the straight run between the two anchors.
    const obstacle = boxed({ left: 150, top: 0, width: 40, height: 40 });

    const plain = lineD({ start, end, seed: 7 });
    const routed = lineD({ start, end, seed: 7, avoid: obstacle });
    expect(plain).toBeTruthy();
    expect(routed).toBeTruthy();
    expect(routed).not.toBe(plain);
  });

  it('elbow route ignores avoid (existing contract)', () => {
    const start = boxed({ left: 0, top: 0, width: 100, height: 40 });
    const end = boxed({ left: 300, top: 0, width: 100, height: 40 });
    const obstacle = boxed({ left: 150, top: 0, width: 40, height: 40 });

    const plain = lineD({ start, end, seed: 7, route: 'elbow' });
    const routed = lineD({
      start,
      end,
      seed: 7,
      route: 'elbow',
      avoid: obstacle,
    });
    expect(plain).toBeTruthy();
    expect(routed).toBe(plain);
  });
});

describe('ScrollArrow shaft/head junction (#59)', () => {
  // Same jsdom SVG-geometry stub as the avoid-routing suite above, plus the
  // label-measurement calls (getPointAtLength/getBBox). rough.js is
  // deterministic for a fixed seed, so DOM `d` strings witness geometry.
  type SvgStubs = {
    getTotalLength?: unknown;
    getPointAtLength?: unknown;
    getBBox?: unknown;
  };
  beforeEach(() => {
    const proto = SVGElement.prototype as SvgStubs;
    proto.getTotalLength = () => 100;
    proto.getPointAtLength = (l: number) => ({ x: l, y: 20 });
    proto.getBBox = () => ({ x: 0, y: 0, width: 20, height: 10 });
  });
  afterEach(() => {
    const proto = SVGElement.prototype as SvgStubs;
    delete proto.getTotalLength;
    delete proto.getPointAtLength;
    delete proto.getBBox;
  });

  function pathDs(opts: ConstructorParameters<typeof ScrollArrow>[0]): string[] {
    new ScrollArrow(opts);
    const ds = [...document.querySelectorAll('svg path')].map(
      (p) => p.getAttribute('d') ?? '',
    );
    document.querySelectorAll('svg').forEach((s) => s.remove());
    return ds;
  }
  const anchors = () => ({
    start: boxed({ left: 0, top: 0, width: 100, height: 40 }),
    end: boxed({ left: 300, top: 0, width: 100, height: 40 }),
  });

  it('pulls the shaft back from the tip when an end head is drawn (R1)', () => {
    const a = anchors();
    const noHead = pathDs({ ...a, seed: 7, head: 'none' })[0];
    const withHead = pathDs({ ...a, seed: 7, head: 'end' })[0];
    expect(noHead).toBeTruthy();
    expect(withHead).toBeTruthy();
    expect(withHead).not.toBe(noHead);
  });

  it('leaves the shaft untouched when no head is drawn (R4)', () => {
    // headSize can only reach the line through the inset; with head:'none'
    // the shaft must not depend on it.
    const a = anchors();
    const small = pathDs({ ...a, seed: 7, head: 'none', headSize: 14 })[0];
    const large = pathDs({ ...a, seed: 7, head: 'none', headSize: 28 })[0];
    expect(small).toBe(large);
  });

  it('scales the shaft inset with headSize', () => {
    const a = anchors();
    const small = pathDs({ ...a, seed: 7, head: 'end', headSize: 14 })[0];
    const large = pathDs({ ...a, seed: 7, head: 'end', headSize: 28 })[0];
    expect(small).not.toBe(large);
  });

  it('insets the start too for head: both (R2)', () => {
    const a = anchors();
    const endOnly = pathDs({ ...a, seed: 7, head: 'end' })[0];
    const both = pathDs({ ...a, seed: 7, head: 'both' })[0];
    expect(both).not.toBe(endOnly);
  });

  it('keeps the arrowhead anchored at the true socket point (R3)', () => {
    // anchorEnds (preserveVertices) keeps exact vertices, so the head path
    // must still pass through the true end socket (300, 20) even though the
    // shaft now stops short of it.
    const a = anchors();
    const ds = pathDs({ ...a, seed: 7, head: 'end' });
    const headD = ds[ds.length - 1]!;
    expect(headD).toMatch(/300[ ,]+20/);
  });

  it('trims the elbow shaft when an end head is drawn (R5)', () => {
    const a = anchors();
    const noHead = pathDs({ ...a, seed: 7, route: 'elbow', head: 'none' })[0];
    const withHead = pathDs({ ...a, seed: 7, route: 'elbow', head: 'end' })[0];
    expect(withHead).not.toBe(noHead);
  });

  it('still renders a label on a headed arrow', () => {
    const a = anchors();
    new ScrollArrow({ ...a, seed: 7, head: 'both', label: 'hi' });
    expect(document.querySelector('svg text')?.textContent).toBe('hi');
    document.querySelectorAll('svg').forEach((s) => s.remove());
  });
});
