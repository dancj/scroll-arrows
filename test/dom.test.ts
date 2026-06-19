import { describe, it, expect } from 'vitest';
import { docRect } from '../src/geometry';
import { midpointRect } from '../src/progress';

/** jsdom returns zeroed rects, so stub getBoundingClientRect per element. */
function boxed(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 0, height: 0, ...rect }) as DOMRect;
  return el;
}

describe('docRect', () => {
  it('adds window scroll offset to the client rect', () => {
    window.scrollX = 30;
    window.scrollY = 70;
    const el = boxed({ left: 10, top: 20, width: 100, height: 40 });
    expect(docRect(el)).toEqual({ left: 40, top: 90, width: 100, height: 40 });
    window.scrollX = 0;
    window.scrollY = 0;
  });
});

describe('midpointRect', () => {
  it('returns a zero-size rect at the centroid of the two element centers', () => {
    const a = boxed({ left: 0, top: 0, width: 100, height: 100 }); // center 50,50
    const b = boxed({ left: 200, top: 200, width: 100, height: 100 }); // center 250,250
    const m = midpointRect(a, b);
    expect(m).toEqual({ left: 150, top: 150, width: 0, height: 0 });
  });
});
