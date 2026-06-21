import { useEffect, useRef, type RefObject } from 'react';
import { ScrollArrow } from './scroll-arrow';
import { ScrollArrowGroup } from './group';
import type { ScrollArrowOptions, ScrollArrowGroupOptions } from './types';

type Anchor = RefObject<Element | null> | Element | string;

export interface UseScrollArrowOptions extends Omit<
  ScrollArrowOptions,
  'start' | 'end'
> {
  start: Anchor;
  end: Anchor;
  /** Re-create the arrow when any value here changes. */
  deps?: unknown[];
}

function read(a: Anchor): Element | string | null {
  if (typeof a === 'string') return a;
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

export type ScrollArrowProps = UseScrollArrowOptions;

/** Declarative component form. Renders nothing itself. */
export function ScrollArrowLine(props: ScrollArrowProps): null {
  useScrollArrow(props);
  return null;
}

/** One arrow in a group, with React-ref anchors. */
export interface GroupArrow extends Omit<ScrollArrowOptions, 'start' | 'end'> {
  start: Anchor;
  end: Anchor;
}

export interface UseScrollArrowGroupOptions extends Omit<
  ScrollArrowGroupOptions,
  'arrows'
> {
  arrows: GroupArrow[];
  /** Re-create the group when any value here changes. */
  deps?: unknown[];
}

/**
 * Imperatively manage a staggered ScrollArrowGroup tied to element refs.
 * Returns nothing; the arrows live in an overlay <svg>, not the React tree.
 */
export function useScrollArrowGroup(options: UseScrollArrowGroupOptions): void {
  const groupRef = useRef<ScrollArrowGroup | null>(null);
  const { arrows, deps = [], ...rest } = options;

  useEffect(() => {
    const resolved = arrows
      .map((a) => {
        const s = read(a.start);
        const e = read(a.end);
        if (!s || !e) return null;
        return { ...a, start: s, end: e } as ScrollArrowOptions;
      })
      .filter((a): a is ScrollArrowOptions => a !== null);
    if (resolved.length === 0) return;
    const group = new ScrollArrowGroup({ ...rest, arrows: resolved });
    groupRef.current = group;
    return () => {
      group.destroy();
      groupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export type ScrollArrowGroupProps = UseScrollArrowGroupOptions;

/** Declarative group form. Renders nothing itself. */
export function ScrollArrowGroupLines(props: ScrollArrowGroupProps): null {
  useScrollArrowGroup(props);
  return null;
}

export type { ScrollArrowOptions, ScrollArrowGroupOptions };
