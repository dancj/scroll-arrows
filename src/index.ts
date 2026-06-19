export { ScrollArrow } from './scroll-arrow';
export type {
  ScrollArrowOptions,
  ScrollOptions,
  Socket,
  ArrowHead,
  ElementRef,
  Point,
} from './types';
export { easeInOutCubic } from './progress';

import { ScrollArrow } from './scroll-arrow';
import type { ScrollArrowOptions } from './types';

/** Convenience factory. `const a = scrollArrow({ start, end })`. */
export function scrollArrow(options: ScrollArrowOptions): ScrollArrow {
  return new ScrollArrow(options);
}
