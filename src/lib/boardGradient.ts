/** Stored in Excalidraw customData so history, copies, scene files and board sync retain the fill. */
export type BoardGradient = { type: "linear"; start: string; end: string; angle: number };
export type GradientElement = {
  type: string;
  width?: number;
  height?: number;
  fillStyle?: string;
  customData?: Record<string, unknown>;
};

export const nnGradientColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

/** Invalid/unsupported metadata falls back to the normal fill. Blur temporarily takes precedence. */
export function nnReadGradient(element: GradientElement): BoardGradient | null {
  const value = element.customData?.backgroundGradient as Partial<BoardGradient> | undefined;
  if (element.type !== "rectangle" || element.customData?.blur || element.fillStyle !== "solid" ||
      !value || value.type !== "linear" || !nnGradientColor(value.start) || !nnGradientColor(value.end) ||
      typeof value.angle !== "number" || !Number.isFinite(value.angle)) return null;
  return { type: "linear", start: value.start, end: value.end, angle: ((value.angle % 360) + 360) % 360 };
}

/** 0° runs left to right, 90° top to bottom. Project corners so the stops span the whole rectangle. */
export function nnGradientPoints(width: number, height: number, angle: number) {
  const radians = angle * Math.PI / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  return [width / 2 - dx * half, height / 2 - dy * half, width / 2 + dx * half, height / 2 + dy * half] as const;
}

/** Called by the pinned Excalidraw renderer patch before RoughJS generates the actual fill path. */
export function nnGradientRoughOptions<T extends { fill?: unknown; fillStyle?: string }>(element: GradientElement, options: T): T {
  const gradient = nnReadGradient(element);
  return gradient ? { ...options, fill: gradient.start, fillStyle: "solid" } : options;
}

/** Use the original rough/rounded path and stroke. Do not mutate the cached drawable or its options. */
export function nnGradientCanvasShape<T extends { options: { fill?: unknown } }>(element: GradientElement, shape: T, context: CanvasRenderingContext2D): T {
  const gradient = nnReadGradient(element);
  if (!gradient) return shape;
  const points = nnGradientPoints(element.width ?? 0, element.height ?? 0, gradient.angle);
  const fill = context.createLinearGradient(...points);
  fill.addColorStop(0, gradient.start);
  fill.addColorStop(1, gradient.end);
  return { ...shape, options: { ...shape.options, fill } };
}

/** SVG exports use local shape coordinates, including rotation, frame clips and the original opacity. */
export function nnGradientSvg(element: GradientElement, node: SVGGElement, root: SVGSVGElement) {
  const gradient = nnReadGradient(element);
  if (!gradient) return;
  const NS = "http://www.w3.org/2000/svg";
  const definition = root.ownerDocument.createElementNS(NS, "linearGradient");
  // No element IDs in the identifier: pasted/imported IDs can contain arbitrary characters.
  const id = `nn-gradient-${Math.random().toString(36).slice(2)}`;
  definition.setAttribute("id", id);
  definition.setAttribute("gradientUnits", "userSpaceOnUse");
  const points = nnGradientPoints(element.width ?? 0, element.height ?? 0, gradient.angle);
  ["x1", "y1", "x2", "y2"].forEach((name, i) => definition.setAttribute(name, String(points[i])));
  [gradient.start, gradient.end].forEach((color, i) => {
    const stop = root.ownerDocument.createElementNS(NS, "stop");
    stop.setAttribute("offset", String(i));
    stop.setAttribute("stop-color", color);
    definition.appendChild(stop);
  });
  const defs = root.ownerDocument.createElementNS(NS, "defs");
  defs.appendChild(definition);
  root.insertBefore(defs, root.firstChild);
  for (const path of node.querySelectorAll("path[fill]")) {
    if (path.getAttribute("fill") === gradient.start) path.setAttribute("fill", `url(#${id})`);
  }
}

/** Existing solid-color and fill-pattern actions remove only our gradient metadata (same undo step). */
export function nnGradientSolidData(element: GradientElement) {
  if (element.type !== "rectangle" || !element.customData?.backgroundGradient) return {};
  const customData = { ...element.customData };
  delete customData.backgroundGradient;
  return { customData };
}
