export { ScrollArrow } from './scroll-arrow';
export { ScrollArrowGroup } from './group';
export type {
  ScrollArrowOptions,
  ScrollArrowGroupOptions,
  ScrollOptions,
  Socket,
  ArrowHead,
  ElementRef,
  LabelPosition,
  Point,
} from './types';
export { easeInOutCubic } from './progress';

import { ScrollArrow } from './scroll-arrow';
import { ScrollArrowGroup } from './group';
import type { ScrollArrowOptions, ScrollArrowGroupOptions } from './types';

/** Convenience factory. `const a = scrollArrow({ start, end })`. */
export function scrollArrow(options: ScrollArrowOptions): ScrollArrow {
  return new ScrollArrow(options);
}

/** Convenience factory. `const g = scrollArrowGroup({ arrows: [...] })`. */
export function scrollArrowGroup(
  options: ScrollArrowGroupOptions,
): ScrollArrowGroup {
  return new ScrollArrowGroup(options);
}
