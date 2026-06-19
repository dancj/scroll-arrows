import {
  useEffect,
  useRef,
  type RefObject,
} from "react";
import { ScrollArrow } from "./scroll-arrow";
import type { ScrollArrowOptions } from "./types";

type Anchor = RefObject<Element | null> | Element | string;

export interface UseScrollArrowOptions
  extends Omit<ScrollArrowOptions, "start" | "end"> {
  start: Anchor;
  end: Anchor;
  /** Re-create the arrow when any value here changes. */
  deps?: unknown[];
}

function read(a: Anchor): Element | string | null {
  if (typeof a === "string") return a;
  if (a instanceof Element) return a;
  return a.current;
}

/**
 * Imperatively manage a ScrollArrow tied to two element refs. Returns nothing;
 * the arrow lives in an overlay <svg>, not the React tree.
 */
export function useScrollArrow(options: UseScrollArrowOptions): void {
  const arrowRef = useRef<ScrollArrow | null>(null);
  const { start, end, deps = [], ...rest } = options;

  useEffect(() => {
    const s = read(start);
    const e = read(end);
    if (!s || !e) return;
    const arrow = new ScrollArrow({ ...rest, start: s, end: e });
    arrowRef.current = arrow;
    return () => {
      arrow.destroy();
      arrowRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export interface ScrollArrowProps extends UseScrollArrowOptions {}

/** Declarative component form. Renders nothing itself. */
export function ScrollArrowLine(props: ScrollArrowProps): null {
  useScrollArrow(props);
  return null;
}

export type { ScrollArrowOptions };
