const SVG_NS = 'http://www.w3.org/2000/svg';

const overlays = new WeakMap<Element, SVGSVGElement>();

/** One shared, full-size, click-through <svg> per container. */
export function getOverlay(container: Element): SVGSVGElement {
  let svg = overlays.get(container);
  if (svg && svg.isConnected) return svg;

  svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('data-scroll-arrows', '');
  Object.assign(svg.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: '9999',
  } satisfies Partial<CSSStyleDeclaration>);

  // The container needs a positioning context so absolute children align.
  if (container === document.body) {
    document.body.style.position ||= 'relative';
  } else {
    const pos = getComputedStyle(container).position;
    if (pos === 'static')
      (container as HTMLElement).style.position = 'relative';
  }

  container.appendChild(svg);
  overlays.set(container, svg);
  return svg;
}

/** Document-coordinate origin of the overlay, so we can offset arrow points. */
export function overlayOrigin(svg: SVGSVGElement): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY };
}

export function createGroup(): SVGGElement {
  return document.createElementNS(SVG_NS, 'g');
}

export function createSvgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}
