/* eslint-disable @typescript-eslint/no-explicit-any */
// Turns scratchboard items into sketch-kit drawables (lines, fills, lettering), plus geometry helpers.
// Every item carries a seed, so its hand-drawn wobble is the same on every redraw.

export type Pt = [number, number];
export type Fill = { color: string; tint?: boolean } | null;
export type TextStyle = "note" | "head" | "label" | "big";
export type Item = {
  id: string;
  seed: number;
  kind: "pen" | "line" | "arrow" | "rect" | "diamond" | "ellipse" | "poly" | "text" | "badge" | "tick";
  /** poly: closed shape (fillable); sketch = each side its own overshooting line */
  closed?: boolean;
  sketch?: boolean;
  color?: string;
  w?: number;
  fill?: Fill;
  // pen
  pts?: Pt[];
  // line / arrow
  a?: Pt;
  b?: Pt;
  bend?: number;
  dashed?: boolean;
  // rect / diamond
  x?: number;
  y?: number;
  h?: number;
  r?: number;
  width?: number;
  // ellipse / badge
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  // text / badge
  text?: string;
  style?: TextStyle;
  size?: number;
  align?: "left" | "center" | "right";
  s?: number;
};

export const INK = "#2B2B2C";
export const PALETTE: { name: string; hex: string }[] = [
  { name: "Ink", hex: "#2B2B2C" },
  { name: "Graphite", hex: "#6B6A66" },
  { name: "Construction blue", hex: "#5B8FC7" },
  { name: "Coral", hex: "#E2774F" },
  { name: "Blue", hex: "#4F8DD6" },
  { name: "Violet", hex: "#9B6FC9" },
  { name: "Pink", hex: "#C96FA6" },
  { name: "Tan", hex: "#C28F55" },
  { name: "Green", hex: "#7FA752" },
  { name: "Red", hex: "#E24B3F" },
  { name: "Grey", hex: "#8E8B84" },
  { name: "Highlighter", hex: "#F6D36B" },
];

/** The type voices from the style: font, weight, default size, spacing */
export const TEXT: Record<TextStyle, { family: string; weight: number; size: number; spacing: number; upper: boolean; label: string }> = {
  note: { family: '"Architects Daughter", "Comic Sans MS", cursive', weight: 400, size: 36, spacing: 0, upper: false, label: "Note" },
  head: { family: '"Archivo", system-ui, sans-serif', weight: 800, size: 46, spacing: 2, upper: true, label: "Heading" },
  label: { family: '"JetBrains Mono", ui-monospace, monospace', weight: 500, size: 24, spacing: 1, upper: true, label: "Label" },
  big: { family: '"Archivo", system-ui, sans-serif', weight: 900, size: 200, spacing: 0, upper: true, label: "Big number" },
};

export const shownText = (it: Item) => {
  const t = it.text ?? "";
  return TEXT[it.style ?? "note"].upper ? t.toUpperCase() : t;
};

let measureCtx: CanvasRenderingContext2D | null = null;
/** Text can have several lines (Enter while typing); each line sits this far below the last */
export const lineGap = (it: Item) => (it.size ?? TEXT[it.style ?? "note"].size) * (it.style === "big" ? 1.0 : 1.3);
export const textLines = (it: Item) => shownText(it).split("\n");

/** Width of the widest line */
export function textWidth(it: Item) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const st = TEXT[it.style ?? "note"];
  const size = it.size ?? st.size;
  measureCtx!.font = `${st.weight} ${size}px ${st.family}`;
  return Math.max(0, ...textLines(it).map((s) => measureCtx!.measureText(s).width + st.spacing * Math.max(0, s.length - 1)));
}

const ellipsePts = (cx: number, cy: number, rx: number, ry: number, n = 64): Pt[] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);
const diamondPts = (x: number, y: number, w: number, h: number): Pt[] => [
  [x + w / 2, y],
  [x + w, y + h / 2],
  [x + w / 2, y + h],
  [x, y + h / 2],
];
function rrectPts(S: any, x: number, y: number, w: number, h: number, r: number): Pt[] {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  return rr > 1 ? S.G.rrect(x, y, w, h, rr) : S.G.rect(x, y, w, h);
}
/** Normalised box for rect-like items (drawn right-to-left or bottom-up) */
export function box(it: Item) {
  const x = it.x ?? 0,
    y = it.y ?? 0,
    w = it.width ?? 0,
    h = it.h ?? 0;
  return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
}

/** Arrow control points: a relaxed cubic from a to b, bowed sideways by bend */
export function arrowCtrl(a: Pt, b: Pt, bend = 0.25): [Pt, Pt, Pt, Pt] {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = Math.hypot(dx, dy) || 1,
    nx = -dy / L,
    ny = dx / L,
    k = bend * L * 0.32;
  return [a, [a[0] + dx * 0.3 + nx * k, a[1] + dy * 0.3 + ny * k], [a[0] + dx * 0.72 + nx * k, a[1] + dy * 0.72 + ny * k], b];
}

export type Drawable = { el: any; layer: number; tool: boolean; dur: number };

/** The kit drawables for one item (fills under ink, as in the style) */
export function build(S: any, it: Item): Drawable[] {
  S.seed(it.seed || 1);
  const col = it.color ?? INK;
  const w = it.w ?? 2.6;
  const out: Drawable[] = [];
  const fillOf = (poly: Pt[]) => {
    if (!it.fill) return;
    const o = it.fill.tint ? { alpha: 0.07, mw: 70, seed: it.seed } : { seed: it.seed };
    out.push({ el: S.fill([poly], it.fill.color, o), layer: 0, tool: !it.fill.tint, dur: 0.8 });
  };
  switch (it.kind) {
    case "pen": {
      const pts = it.pts ?? [];
      if (pts.length < 2) break;
      out.push({ el: S.ink([S.K.curve(pts, { w, col, amp: 0.35 })]), layer: 2, tool: true, dur: Math.min(1.6, Math.max(0.3, pts.length / 90)) });
      break;
    }
    case "line": {
      if (!it.a || !it.b) break;
      const strokes = it.dashed ? S.K.dashed([it.a, it.b], 22, 16, { w, col, a: 0.8 }) : S.K.line(it.a, it.b, { w, col });
      out.push({ el: S.ink([strokes]), layer: 2, tool: true, dur: Math.min(1, Math.max(0.3, Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]) / 900)) });
      break;
    }
    case "arrow": {
      if (!it.a || !it.b) break;
      const [p0, p1, p2, p3] = arrowCtrl(it.a, it.b, it.bend ?? 0.25);
      out.push({ el: S.ink([S.K.arrow(p0, p1, p2, p3, { w, col })]), layer: 2, tool: true, dur: 0.6 });
      break;
    }
    case "poly": {
      const pts = it.pts ?? [];
      if (pts.length < 2) break;
      if (it.closed !== false) fillOf(pts);
      // w 0 = color only, no outline (e.g. a tinted band between two walls)
      if (w > 0) out.push({ el: S.ink([S.K.poly(pts, it.closed !== false, { w, col, sketch: !!it.sketch })]), layer: 2, tool: true, dur: 0.7 });
      break;
    }
    case "rect": {
      const b = box(it);
      const poly = rrectPts(S, b.x, b.y, b.w, b.h, it.r ?? 0);
      fillOf(poly);
      const strokes = (it.r ?? 0) > 1 ? S.K.poly(poly, true, { w, col }) : S.K.rect(b.x, b.y, b.w, b.h, { w, col });
      out.push({ el: S.ink([strokes]), layer: 2, tool: true, dur: 0.6 });
      break;
    }
    case "diamond": {
      const b = box(it);
      const poly = diamondPts(b.x, b.y, b.w, b.h);
      fillOf(poly);
      out.push({ el: S.ink([S.K.poly(poly, true, { w, col, sketch: true })]), layer: 2, tool: true, dur: 0.6 });
      break;
    }
    case "ellipse": {
      const cx = it.cx ?? 0,
        cy = it.cy ?? 0,
        rx = Math.abs(it.rx ?? 0),
        ry = Math.abs(it.ry ?? 0);
      fillOf(ellipsePts(cx, cy, rx * 0.97, ry * 0.97));
      const strokes = Math.abs(rx - ry) < 1 ? S.K.circle(cx, cy, rx, { w, col }) : S.K.ellipse(cx, cy, rx, ry, { w, col });
      out.push({ el: S.ink([strokes]), layer: 2, tool: true, dur: 0.6 });
      break;
    }
    case "text": {
      const style = it.style ?? "note";
      const st = TEXT[style];
      if (!shownText(it).trim()) break;
      const size = it.size ?? st.size;
      const align = it.align ?? "left";
      const x = it.x ?? 0;
      textLines(it).forEach((s, i) => {
        if (!s.trim()) return;
        const y = (it.y ?? 0) + i * lineGap(it);
        if (style === "big") out.push({ el: S.bigText(s, x, y, { size, color: it.fill?.color ?? col, align }), layer: 1, tool: true, dur: 1.4 });
        else {
          const o = { size, color: col, align, family: st.family, weight: st.weight, spacing: st.spacing };
          out.push({ el: S.text(s, x, y, o), layer: 2, tool: true, dur: Math.min(1.2, Math.max(0.3, s.length * 0.045)) });
        }
      });
      break;
    }
    case "badge": {
      const cx = it.cx ?? 0,
        cy = it.cy ?? 0,
        r = it.r ?? 44;
      out.push({ el: S.ink([S.K.circle(cx, cy, r, { w: 3.4, col })]), layer: 2, tool: true, dur: 0.35 });
      out.push({ el: S.fill([S.G.circle(cx, cy, r - 3, 40)], it.fill?.color ?? "#4F8DD6", { mw: Math.max(12, r * 0.4), seed: it.seed }), layer: 0, tool: true, dur: 0.35 });
      if (it.text) out.push({ el: S.head(it.text.toUpperCase(), cx, cy + r * 0.42, { size: r * 1.2, color: INK }), layer: 2, tool: true, dur: 0.25 });
      break;
    }
    case "tick":
      out.push({ el: S.ink([S.K.tick(it.x ?? 0, it.y ?? 0, it.s ?? 1.4)]), layer: 2, tool: true, dur: 0.3 });
      break;
  }
  return out;
}

/** World-space bounds of an item, for selection and hit testing */
export function bounds(it: Item): { x: number; y: number; w: number; h: number } {
  const pad = (it.w ?? 2.6) * 2;
  switch (it.kind) {
    case "poly":
    case "pen": {
      const pts = it.pts?.length ? it.pts : [[0, 0] as Pt];
      const xs = pts.map((p) => p[0]),
        ys = pts.map((p) => p[1]);
      return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
    }
    case "line":
    case "arrow": {
      const pts = it.kind === "arrow" && it.a && it.b ? arrowCtrl(it.a, it.b, it.bend ?? 0.25) : [it.a ?? [0, 0], it.b ?? [0, 0]];
      const xs = pts.map((p) => p[0]),
        ys = pts.map((p) => p[1]);
      return { x: Math.min(...xs) - pad - 10, y: Math.min(...ys) - pad - 10, w: Math.max(...xs) - Math.min(...xs) + pad * 2 + 20, h: Math.max(...ys) - Math.min(...ys) + pad * 2 + 20 };
    }
    case "rect":
    case "diamond": {
      const b = box(it);
      return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    }
    case "ellipse":
      return { x: (it.cx ?? 0) - Math.abs(it.rx ?? 0) - pad, y: (it.cy ?? 0) - Math.abs(it.ry ?? 0) - pad, w: Math.abs(it.rx ?? 0) * 2 + pad * 2, h: Math.abs(it.ry ?? 0) * 2 + pad * 2 };
    case "badge": {
      const r = it.r ?? 44;
      return { x: (it.cx ?? 0) - r - 6, y: (it.cy ?? 0) - r - 6, w: r * 2 + 12, h: r * 2 + 12 };
    }
    case "tick": {
      const s = it.s ?? 1.4;
      return { x: (it.x ?? 0) - 20 * s, y: (it.y ?? 0) - 18 * s, w: 44 * s, h: 34 * s };
    }
    case "text": {
      const st = TEXT[it.style ?? "note"];
      const size = it.size ?? st.size;
      const w = textWidth(it);
      const x0 = it.align === "center" ? (it.x ?? 0) - w / 2 : it.align === "right" ? (it.x ?? 0) - w : (it.x ?? 0);
      return { x: x0 - 6, y: (it.y ?? 0) - size * 0.9, w: w + 12, h: size * 1.15 + (textLines(it).length - 1) * lineGap(it) };
    }
  }
}

/** Distance from a point to a segment */
function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
const polyDist = (p: Pt, pts: Pt[], closed: boolean) => {
  let d = Infinity;
  for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i % pts.length]));
  return d;
};
const inPoly = (p: Pt, pts: Pt[]) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i],
      [xj, yj] = pts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-9) + xi) c = !c;
  }
  return c;
};

/** Is the point on this item? (lines need you to be near the stroke; filled shapes count inside) */
export function hit(it: Item, p: Pt, tol: number): boolean {
  switch (it.kind) {
    case "pen":
      return polyDist(p, it.pts ?? [], false) < tol + (it.w ?? 2.6);
    case "poly":
      return polyDist(p, it.pts ?? [], it.closed !== false) < tol + 4 || (!!it.fill && it.closed !== false && inPoly(p, it.pts ?? []));
    case "line":
      return !!it.a && !!it.b && segDist(p, it.a, it.b) < tol + (it.w ?? 2.6);
    case "arrow": {
      if (!it.a || !it.b) return false;
      const [p0, p1, p2, p3] = arrowCtrl(it.a, it.b, it.bend ?? 0.25);
      const pts: Pt[] = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24,
          u = 1 - t;
        return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
      });
      return polyDist(p, pts, false) < tol + 4;
    }
    case "rect":
    case "diamond": {
      const b = box(it);
      const pts: Pt[] = it.kind === "rect" ? [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]] : diamondPts(b.x, b.y, b.w, b.h);
      return polyDist(p, pts, true) < tol + 4 || (!!it.fill && inPoly(p, pts));
    }
    case "ellipse": {
      const rx = Math.abs(it.rx ?? 1) || 1,
        ry = Math.abs(it.ry ?? 1) || 1;
      const d = Math.hypot((p[0] - (it.cx ?? 0)) / rx, (p[1] - (it.cy ?? 0)) / ry);
      return Math.abs(d - 1) * Math.min(rx, ry) < tol + 4 || (!!it.fill && d < 1);
    }
    default: {
      const b = bounds(it);
      return p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h;
    }
  }
}

/** Move an item by dx, dy */
export function moved(it: Item, dx: number, dy: number): Item {
  const m = (p?: Pt): Pt | undefined => (p ? [p[0] + dx, p[1] + dy] : p);
  return {
    ...it,
    ...(it.pts ? { pts: it.pts.map((p) => [p[0] + dx, p[1] + dy] as Pt) } : {}),
    ...(it.a ? { a: m(it.a), b: m(it.b) } : {}),
    ...(it.x !== undefined ? { x: it.x + dx } : {}),
    ...(it.y !== undefined ? { y: it.y + dy } : {}),
    ...(it.cx !== undefined ? { cx: it.cx + dx } : {}),
    ...(it.cy !== undefined ? { cy: it.cy + dy } : {}),
  };
}

/** Smooth a freehand path a little and drop points closer than 2px */
export function tidyPath(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 2) out.push(p);
  }
  if (out.length < 3) return out;
  return out.map((p, i) => {
    if (i === 0 || i === out.length - 1) return p;
    const a = out[i - 1],
      b = out[i + 1];
    return [(a[0] + p[0] * 2 + b[0]) / 4, (a[1] + p[1] * 2 + b[1]) / 4];
  });
}
