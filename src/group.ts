import { ScrollArrow } from './scroll-arrow';
import type {
  ScrollArrowGroupOptions,
  ScrollOptions,
  ElementRef,
} from './types';
import { scrollProgress, clamp01 } from './progress';
import { docRect, type DocRect } from './geometry';

/** A draw window within the group's 0..1 progress for one arrow. */
export interface StaggerWindow {
  start: number;
  span: number;
}

/**
 * Slice `[0,1]` into one draw window per arrow given a `stagger` of 0..1.
 * `stagger = 1` => non-overlapping equal slices (fully sequential).
 * `stagger = 0` => every window is the full `[0,1]` (all draw together).
 */
export function staggerWindows(n: number, stagger: number): StaggerWindow[] {
  if (n <= 0) return [];
  const s = clamp01(stagger);
  // span chosen so the last window ends exactly at 1: span * (1 + (n-1)*s) = 1.
  const span = 1 / (1 + (n - 1) * s);
  const step = span * s;
  return Array.from({ length: n }, (_, i) => ({ start: i * step, span }));
}

/** Map overall progress `p` into a single window's local 0..1 progress. */
export function windowProgress(p: number, w: StaggerWindow): number {
  if (w.span <= 0) return p > w.start ? 1 : 0;
  return clamp01((p - w.start) / w.span);
}

/**
 * A coordinated set of arrows that draw in a staggered sequence off one shared
 * scroll trigger (or manual `setProgress`). Owns its arrows; `destroy()` tears
 * them all down.
 */
export class ScrollArrowGroup {
  private opts: Required<
    Pick<ScrollArrowGroupOptions, 'stagger' | 'speed' | 'easing'>
  > &
    ScrollArrowGroupOptions;
  private arrows: ScrollArrow[];
  private windows: StaggerWindow[];
  private elements: Element[] = [];
  private target: Element | null = null;
  private progress = 0;
  private rafId = 0;
  private destroyed = false;

  constructor(options: ScrollArrowGroupOptions) {
    if (!options.arrows || options.arrows.length === 0) {
      throw new Error('[scroll-arrows] group needs at least one arrow');
    }
    this.opts = {
      stagger: 1,
      speed: 1,
      easing: (t) => t,
      ...options,
    };

    // Each arrow is driven by the group, never by its own scroll listener.
    this.arrows = options.arrows.map(
      (a) => new ScrollArrow({ ...a, scroll: false, progress: 0 }),
    );
    this.windows = staggerWindows(this.arrows.length, this.opts.stagger);

    // Collect every endpoint element for the default trigger + resize tracking.
    for (const a of options.arrows) {
      const s = resolve(a.start);
      const e = resolve(a.end);
      if (s) this.elements.push(s);
      if (e) this.elements.push(e);
    }

    const scroll = this.opts.scroll;
    if (scroll !== false && scroll?.target) {
      this.target = resolve(scroll.target);
    }

    this.bind();
    this.update();
  }

  /** Manually set group progress (0..1). Only meaningful when scroll is false. */
  setProgress(p: number): void {
    this.progress = clamp01(p);
    this.distribute();
  }

  /** Recompute geometry for every arrow (call after layout changes). */
  refresh(): void {
    this.arrows.forEach((a) => a.refresh());
    this.update();
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('scroll', this.onScroll, true);
    window.removeEventListener('resize', this.onScroll);
    cancelAnimationFrame(this.rafId);
    this.arrows.forEach((a) => a.destroy());
  }

  // --- internals ---------------------------------------------------------

  private bind(): void {
    if (this.opts.scroll === false) return;
    window.addEventListener('scroll', this.onScroll, true);
    window.addEventListener('resize', this.onScroll);
  }

  private onScroll = (): void => {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.update();
    });
  };

  private update(): void {
    if (this.destroyed) return;
    if (this.opts.scroll === false) {
      this.distribute();
      return;
    }
    const scroll = (this.opts.scroll ?? {}) as ScrollOptions;
    const range = scroll.range ?? [0.85, 0.35];
    const rect = this.target ? docRect(this.target) : this.groupRect();
    const raw = scrollProgress(rect, range);
    this.progress = clamp01(raw * this.opts.speed);
    this.distribute();
  }

  /** Push each arrow to its sliced local progress for the current group value. */
  private distribute(): void {
    const eased = clamp01(this.opts.easing(this.progress));
    this.arrows.forEach((arrow, i) => {
      arrow.setProgress(windowProgress(eased, this.windows[i]!));
    });
  }

  /** Synthetic rect spanning every endpoint, used as the default trigger. */
  private groupRect(): DocRect {
    const rects = this.elements.map(docRect);
    if (rects.length === 0) return { left: 0, top: 0, width: 0, height: 0 };
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const r of rects) {
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.left + r.width);
      bottom = Math.max(bottom, r.top + r.height);
    }
    return { left, top, width: right - left, height: bottom - top };
  }
}

function resolve(ref: ElementRef): Element | null {
  return typeof ref === 'string' ? document.querySelector(ref) : ref;
}
