import rough from 'roughjs';
import type { RoughSVG } from 'roughjs/bin/svg';
import type { ScrollArrowOptions, ElementRef, Socket } from './types';
import {
  docRect,
  resolveEndpoints,
  buildPath,
  arrowHeadPath,
  endTangent,
  startTangent,
  unitNormal,
  routeOffset,
  type Endpoints,
  type Box,
} from './geometry';
import {
  scrollProgress,
  midpointRect,
  easeInOutCubic,
  clamp01,
} from './progress';
import { getOverlay, overlayOrigin, createGroup, createSvgEl } from './overlay';
import { mapRoughness, deriveSeed } from './roughness';
import { dashOffsets, lineProgress, labelOpacity } from './draw';

interface ResolvedRefs {
  start: Element;
  end: Element;
  target: Element | null; // null => synthetic midpoint
}

/** A single hand-drawn arrow that draws itself between two elements on scroll. */
export class ScrollArrow {
  private opts: Required<
    Pick<
      ScrollArrowOptions,
      | 'roughness'
      | 'strokeWidth'
      | 'head'
      | 'headSize'
      | 'speed'
      | 'easing'
      | 'progress'
    >
  > &
    ScrollArrowOptions;
  private container: Element;
  private svg: SVGSVGElement;
  private rc: RoughSVG;
  private group: SVGGElement = createGroup();
  private refs: ResolvedRefs;
  private seed: number;
  private stroke: string;

  /**
   * Drawable segments. Line strokes (rough.js emits 1-2 overlapping ones) share
   * a leading edge so they grow as a single pen tip; heads draw after the line.
   */
  private segments: {
    el: SVGPathElement;
    len: number;
    kind: 'line' | 'head';
  }[] = [];
  /** Representative line stroke + label nodes, when a label is set. */
  private lineEl: SVGPathElement | null = null;
  private labelEl: SVGTextElement | null = null;
  private labelBgEl: SVGRectElement | null = null;
  private progress: number;

  private ro?: ResizeObserver;
  private rafId = 0;
  private destroyed = false;

  constructor(options: ScrollArrowOptions) {
    this.opts = {
      roughness: 0.5,
      strokeWidth: 2,
      head: 'end',
      headSize: 14,
      speed: 1,
      easing: easeInOutCubic,
      progress: 0,
      ...options,
    };
    this.container = options.container ?? document.body;
    this.svg = getOverlay(this.container);
    this.rc = rough.svg(this.svg);
    this.svg.appendChild(this.group);
    this.progress = clamp01(this.opts.progress);

    this.refs = this.resolveRefs();
    this.stroke =
      options.stroke ?? getComputedStyle(this.container).color ?? '#222';
    this.seed =
      options.seed ?? deriveSeed(refKey(options.start), refKey(options.end));

    this.render();
    this.bind();
    this.update();
  }

  /** Manually set draw progress (0..1). Only meaningful when scroll is false. */
  setProgress(p: number): void {
    this.progress = clamp01(p);
    this.applyProgress();
  }

  /** Recompute geometry (call after layout changes you control). */
  refresh(): void {
    this.render();
    this.update();
  }

  destroy(): void {
    this.destroyed = true;
    this.ro?.disconnect();
    window.removeEventListener('scroll', this.onScroll, true);
    window.removeEventListener('resize', this.onScroll);
    cancelAnimationFrame(this.rafId);
    this.group.remove();
  }

  // --- internals ---------------------------------------------------------

  private resolveRefs(): ResolvedRefs {
    const start = resolve(this.opts.start);
    const end = resolve(this.opts.end);
    if (!start || !end) {
      throw new Error('[scroll-arrows] start/end element not found');
    }
    const scroll = this.opts.scroll;
    let target: Element | null = null;
    if (scroll && scroll !== undefined && scroll.target) {
      target = resolve(scroll.target);
    }
    return { start, end, target };
  }

  private resolveAvoid(): Element[] {
    const a = this.opts.avoid;
    if (!a) return [];
    const list = Array.isArray(a) ? a : [a];
    return list.map(resolve).filter((el): el is Element => el !== null);
  }

  private computeEndpoints(): Endpoints {
    const sr = docRect(this.refs.start);
    const er = docRect(this.refs.end);
    const ss: Socket = this.opts.startSocket ?? 'auto';
    const es: Socket = this.opts.endSocket ?? 'auto';
    return resolveEndpoints(sr, er, ss, es);
  }

  private render(): void {
    // Clear previous draw.
    while (this.group.firstChild) this.group.removeChild(this.group.firstChild);
    this.segments = [];

    const ep = this.computeEndpoints();
    const origin = overlayOrigin(this.svg);
    const shift = (e: Endpoints): Endpoints => ({
      start: { x: e.start.x - origin.x, y: e.start.y - origin.y },
      end: { x: e.end.x - origin.x, y: e.end.y - origin.y },
      startNormal: e.startNormal,
      endNormal: e.endNormal,
    });
    const local = shift(ep);

    const { rough: roughOpts, curvature } = mapRoughness(
      this.opts.roughness,
      this.opts.curvature,
      this.stroke,
      this.opts.strokeWidth,
      this.seed,
      this.opts.anchorEnds ?? true,
    );

    // Route around any obstacles, then build the line.
    const obstacles: Box[] = this.resolveAvoid().map((el) => {
      const dr = docRect(el);
      return {
        left: dr.left - origin.x,
        top: dr.top - origin.y,
        width: dr.width,
        height: dr.height,
      };
    });
    const clear = routeOffset(
      local.start,
      local.end,
      obstacles,
      this.opts.avoidPadding ?? 14,
    );
    // A cubic's midpoint only reaches ~0.75x its control-point displacement, so
    // amplify the requested clearance to make the curve actually clear the box.
    const BOW = 1.6;
    const belly = { x: clear.x * BOW, y: clear.y * BOW };
    const d = buildPath(local, curvature, belly);
    this.appendDrawable(this.rc.path(d, roughOpts), 'line');

    // Arrowheads.
    const head = this.opts.head;
    const size = this.opts.headSize;
    if (head === 'end' || head === 'both') {
      const dir = endTangent(local);
      this.appendDrawable(
        this.rc.path(arrowHeadPath(local.end, dir, size), roughOpts),
        'head',
      );
    }
    if (head === 'start' || head === 'both') {
      const dir = startTangent(local);
      this.appendDrawable(
        this.rc.path(arrowHeadPath(local.start, dir, size), roughOpts),
        'head',
      );
    }

    // Measure for the draw-on effect; remember the longest line stroke so the
    // label can ride along it.
    this.lineEl = null;
    let longest = 0;
    for (const seg of this.segments) {
      seg.len = seg.el.getTotalLength();
      seg.el.style.strokeDasharray = String(seg.len);
      seg.el.style.strokeDashoffset = String(seg.len);
      if (seg.kind === 'line' && seg.len >= longest) {
        longest = seg.len;
        this.lineEl = seg.el;
      }
    }

    this.renderLabel();
    this.applyProgress();
  }

  /** Place the label at a point along the line, with a masking background. */
  private renderLabel(): void {
    this.labelEl = null;
    this.labelBgEl = null;
    const text = this.opts.label;
    if (!text || !this.lineEl) return;

    const total = this.lineEl.getTotalLength();
    const at = clampAt(this.opts.labelAt ?? 0.5);
    const pt = this.lineEl.getPointAtLength(at * total);

    // Optional perpendicular offset: sample just-before/just-after to get the
    // local tangent, then shift along its left-hand normal.
    const offset = this.opts.labelOffset ?? 0;
    let x = pt.x;
    let y = pt.y;
    if (offset && total > 0) {
      const eps = Math.min(1, total / 2);
      const before = this.lineEl.getPointAtLength(
        Math.max(0, at * total - eps),
      );
      const after = this.lineEl.getPointAtLength(
        Math.min(total, at * total + eps),
      );
      const n = unitNormal(before, after);
      x += n.x * offset;
      y += n.y * offset;
    }

    const label = createSvgEl('text');
    label.textContent = text;
    label.setAttribute('x', String(x));
    label.setAttribute('y', String(y));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.style.font = this.opts.font ?? '600 16px sans-serif';
    label.style.fill = this.opts.labelColor ?? this.stroke;
    this.group.appendChild(label);

    // Background mask (the "gap" through the line) sized to the text box.
    const bgColor =
      this.opts.labelBackground ??
      getComputedStyle(this.container).backgroundColor;
    if (bgColor && bgColor !== 'none') {
      const pad = 6;
      const box = label.getBBox();
      const rect = createSvgEl('rect');
      rect.setAttribute('x', String(box.x - pad));
      rect.setAttribute('y', String(box.y - pad / 2));
      rect.setAttribute('width', String(box.width + pad * 2));
      rect.setAttribute('height', String(box.height + pad));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', bgColor);
      this.group.insertBefore(rect, label); // behind the text, over the line
      this.labelBgEl = rect;
    }
    this.labelEl = label;
  }

  /** roughjs returns a <g> of one or more <path>; collect them in order. */
  private appendDrawable(g: SVGGElement, kind: 'line' | 'head'): void {
    const paths = g.querySelectorAll('path');
    paths.forEach((p) => {
      const el = p as SVGPathElement;
      el.setAttribute('fill', 'none');
      this.group.appendChild(el);
      this.segments.push({ el, len: 0, kind });
    });
  }

  /**
   * Reveal the line as one growing pen tip (all line sub-strokes advance to the
   * same leading fraction together), then draw the arrowhead(s) sequentially
   * once the line is complete.
   */
  private applyProgress(): void {
    const eased = this.opts.easing(clamp01(this.progress));
    const offsets = dashOffsets(this.segments, eased);
    this.segments.forEach((seg, i) => {
      seg.el.style.strokeDashoffset = String(offsets[i]);
    });

    if (this.labelEl) {
      const op = labelOpacity(
        lineProgress(this.segments, eased),
        this.opts.labelAt ?? 0.5,
      );
      this.labelEl.style.opacity = String(op);
      if (this.labelBgEl) this.labelBgEl.style.opacity = String(op);
    }
  }

  private bind(): void {
    const targets = [this.refs.start, this.refs.end, ...this.resolveAvoid()];
    if (this.refs.target) targets.push(this.refs.target);
    this.ro = new ResizeObserver(() => this.render());
    targets.forEach((t) => this.ro!.observe(t));
    if (this.opts.scroll !== false) {
      window.addEventListener('scroll', this.onScroll, true);
      window.addEventListener('resize', this.onScroll);
    }
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
      this.applyProgress();
      return;
    }
    const scroll = this.opts.scroll ?? {};
    const range = scroll.range ?? [0.85, 0.35];
    const targetRect = this.refs.target
      ? docRect(this.refs.target)
      : midpointRect(this.refs.start, this.refs.end);
    const raw = scrollProgress(targetRect, range);
    this.progress = clamp01(raw * this.opts.speed);
    this.applyProgress();
  }
}

function resolve(ref: ElementRef): Element | null {
  return typeof ref === 'string' ? document.querySelector(ref) : ref;
}

function refKey(ref: ElementRef): string {
  return typeof ref === 'string'
    ? ref
    : ref.tagName + (ref.id ? '#' + ref.id : '');
}

function clampAt(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
