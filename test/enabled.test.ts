import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScrollArrow } from '../src/scroll-arrow';

/**
 * jsdom has no ResizeObserver and no SVG geometry (getTotalLength). A disabled
 * arrow returns before any drawing, so its state is jsdom-testable; the
 * enable→draw path needs a real browser and is exercised manually. See issue #23.
 */

function boxed(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 40, ...rect }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  // @ts-expect-error -- minimal stub for jsdom
  global.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  document.body.innerHTML = '';
  // @ts-expect-error -- clean up stub
  delete global.ResizeObserver;
});

describe('ScrollArrow enabled toggle', () => {
  it('draws nothing and hides the overlay when created disabled', () => {
    const start = boxed({});
    const end = boxed({ left: 200, top: 200 });

    let arrow!: ScrollArrow;
    expect(() => {
      arrow = new ScrollArrow({ start, end, enabled: false });
    }).not.toThrow();

    expect(document.querySelectorAll('path').length).toBe(0);
    // The group is hidden rather than removed (no teardown).
    expect(document.querySelector('g')?.style.display).toBe('none');
    arrow.destroy();
  });

  it('setEnabled with the current state is a no-op (stays disabled)', () => {
    const start = boxed({});
    const end = boxed({ left: 200, top: 200 });
    const arrow = new ScrollArrow({ start, end, enabled: false });

    arrow.setEnabled(false); // already disabled

    expect(document.querySelectorAll('path').length).toBe(0);
    expect(document.querySelector('g')?.style.display).toBe('none');
    arrow.destroy();
  });
});
