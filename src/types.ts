export type Point = { x: number; y: number };

/** Which edge of an element the arrow attaches to. `auto` picks the best side. */
export type Socket = 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'center';

export type ArrowHead = 'start' | 'end' | 'both' | 'none';

/**
 * Line routing style. `curved` (default) is the smooth bezier with single-bend
 * obstacle avoidance. `elbow` draws right-angle connectors (tree/org-chart
 * brackets); `elbow` ignores `avoid`/`curvature`.
 */
export type Route = 'curved' | 'elbow';

/** Anything we can resolve to a live DOM element. */
export type ElementRef = Element | string;

export interface ScrollOptions {
  /**
   * The element whose travel through the viewport drives the draw.
   * Defaults to the midpoint between `start` and `end`.
   */
  target?: ElementRef;
  /**
   * Draw window expressed as fractions of viewport height for the target's
   * top edge. `[0.85, 0.35]` means: empty at 85% down the viewport, fully
   * drawn by 35% down. First value should be larger than the second.
   */
  range?: [number, number];
}

export interface ScrollArrowOptions {
  /** Element the arrow starts from. */
  start: ElementRef;
  /** Element the arrow points to. */
  end: ElementRef;
  /**
   * Where the overlay <svg> mounts. Defaults to document.body. Arrows are
   * positioned in document coordinates so they stay glued while scrolling.
   */
  container?: Element;

  /**
   * The headline knob. 0 = clean straight line, 1 = maximally scratchy and
   * curvy. Maps onto roughjs roughness/bowing plus path curvature.
   */
  roughness?: number;

  /** Stroke color. CSS color string. Default: currentColor of container. */
  stroke?: string;
  /** Stroke width in px. Default 2. */
  strokeWidth?: number;
  /**
   * Deterministic seed so a given arrow keeps the same scribble between
   * renders. Default: derived from start/end so it's stable but unique.
   */
  seed?: number;

  /** Force a start edge. Default "auto". */
  startSocket?: Socket;
  /** Force an end edge. Default "auto". */
  endSocket?: Socket;
  /**
   * Slide the start attach point along its edge, as a fraction of the edge
   * length: `0` (default) = centered, `-0.5`/`+0.5` = the corners. Use to fan
   * out several arrows that leave the same element so they don't stack on one
   * point (e.g. `-0.25`, `0`, `+0.25` for three siblings).
   */
  startSocketOffset?: number;
  /** Slide the end attach point along its edge. See `startSocketOffset`. */
  endSocketOffset?: number;
  /** Extra bow of the underlying curve, 0..1. Folded into roughness if unset. */
  curvature?: number;
  /**
   * Routing style. `"curved"` (default) is the smooth bezier with obstacle
   * avoidance; `"elbow"` draws right-angle connectors for tree/org-chart
   * diagrams. Elbow mode ignores `avoid` and `curvature`. Pair with explicit
   * `startSocket`/`endSocket` for predictable bracket shapes.
   */
  route?: Route;
  /**
   * Pin the stroke's endpoints to the anchor sockets so the arrow always lands
   * on its targets, even at high roughness. Set false to let the scratchy ends
   * wander off the anchors. Default true.
   */
  anchorEnds?: boolean;

  /**
   * Element(s) the arrow should bend around instead of crossing. Single-bend
   * routing — picks the worst blocker and bows the curve clear of it.
   */
  avoid?: ElementRef | ElementRef[];
  /** Gap to keep between the curve and avoided boxes, px. Default 14. */
  avoidPadding?: number;

  /** Which ends get an arrowhead. Default "end". */
  head?: ArrowHead;
  /** Arrowhead length in px. Default 14. */
  headSize?: number;

  /** Text to place along the line. Omit for no label. */
  label?: string;
  /** Position of the label along the line, 0 (start) .. 1 (end). Default 0.5. */
  labelAt?: number;
  /**
   * Perpendicular offset from the line in px. Positive sits to the left of the
   * draw direction, negative to the right; 0 sits on the line. Default 0.
   */
  labelOffset?: number;
  /** Label text color. Default: stroke color. */
  labelColor?: string;
  /**
   * Color painted behind the label to mask the line (the excalidraw "gap"
   * look). Default: the container's background-color. Pass "none" to disable.
   */
  labelBackground?: string;
  /** CSS `font` shorthand for the label. Default "600 16px sans-serif". */
  font?: string;

  /**
   * Scroll behavior. Pass `false` to drive progress manually via
   * `setProgress()`. Default: auto scroll window.
   */
  scroll?: ScrollOptions | false;

  /**
   * Multiplier on draw rate. >1 finishes the stroke earlier in the scroll
   * window, <1 lingers. Default 1.
   */
  speed?: number;

  /** Easing applied to scroll progress before drawing. Default easeInOutCubic. */
  easing?: (t: number) => number;

  /** Start fully drawn instead of empty. Useful with `scroll:false`. Default 0. */
  progress?: number;

  /**
   * Auto-respect `prefers-reduced-motion: reduce`. When the user prefers reduced
   * motion, the arrow renders fully drawn and static (no scroll animation),
   * while still tracking layout. Set false to keep the scroll animation
   * regardless of the OS setting. Default true. Evaluated once at construction.
   */
  respectReducedMotion?: boolean;

  /**
   * Initial enabled state. When `false`, the arrow is created hidden and draws
   * nothing until `setEnabled(true)` is called. Use with a `matchMedia` listener
   * to switch arrows off below a breakpoint (where the diagram reflows) without
   * destroying and rebuilding them. Default true.
   */
  enabled?: boolean;
}

/**
 * A coordinated set of arrows that draw in a staggered sequence, driven by one
 * shared scroll trigger (or manually). Each arrow gets a slice of the group's
 * progress so they reveal as `A then B then C` rather than independently.
 */
export interface ScrollArrowGroupOptions {
  /**
   * The arrows in the group, in reveal order. Each entry takes the usual
   * per-arrow options (roughness, stroke, label, ...); the group forces
   * `scroll: false` on each and drives their progress itself.
   */
  arrows: ScrollArrowOptions[];
  /**
   * How sequential the reveal is, 0..1. `1` (default) draws each arrow in its
   * own non-overlapping slice (`A` finishes before `B` starts). `0` draws them
   * all at once. Values between overlap the slices.
   */
  stagger?: number;
  /**
   * Shared scroll behavior for the whole group. Pass `false` to drive the group
   * manually via `setProgress()`. The `target` defaults to a synthetic rect
   * spanning every arrow's endpoints, so the group reveals as it scrolls in.
   */
  scroll?: ScrollOptions | false;
  /** Multiplier on the group's draw rate. See `ScrollArrowOptions.speed`. Default 1. */
  speed?: number;
  /** Easing applied to the group's overall progress before slicing. Default linear. */
  easing?: (t: number) => number;
  /**
   * Auto-respect `prefers-reduced-motion: reduce` for the whole group. When the
   * user prefers reduced motion, every arrow renders fully drawn and static (no
   * scroll animation). Set false to keep the staggered scroll reveal regardless
   * of the OS setting. Default true. Evaluated once at construction.
   */
  respectReducedMotion?: boolean;

  /**
   * Initial enabled state for the whole group. When `false`, every arrow starts
   * hidden until `setEnabled(true)`. Pairs with a `matchMedia` listener for
   * breakpoint-aware diagrams. Default true.
   */
  enabled?: boolean;
}
