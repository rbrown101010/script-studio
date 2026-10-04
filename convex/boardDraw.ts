// Drawing on Excalidraw boards for agents: they describe simple items (text, labelled shapes, sticky notes, arrows,
// images) and this turns them into real Excalidraw elements, laid out next to what's already there and styled the
// way the board is already drawn (its colors, stroke, roughness, fonts, sizes, spacing and direction).

/* eslint-disable @typescript-eslint/no-explicit-any */
type El = Record<string, any> & { id: string; type: string; x: number; y: number; width: number; height: number };

export type Item =
  | { type: "text"; id?: string; text: string; size?: "s" | "m" | "l" | "xl"; fontSize?: number; color?: string; x?: number; y?: number; link?: string }
  | {
      type: "shape";
      id?: string;
      shape?: "rectangle" | "ellipse" | "diamond";
      label?: string;
      color?: string;
      width?: number;
      height?: number;
      x?: number;
      y?: number;
      link?: string;
    }
  | { type: "sticky"; id?: string; text: string; color?: string; x?: number; y?: number }
  | { type: "arrow"; id?: string; from: string; to: string; label?: string; dashed?: boolean }
  | { type: "image"; id?: string; url: string; width?: number; height?: number; x?: number; y?: number };

export type Options = {
  /** auto (flowchart if there are arrows, else grid) | flow | row | column | grid */
  layout?: "auto" | "flow" | "row" | "column" | "grid";
  /** Which way flowcharts run; defaults to the board's own direction */
  direction?: "right" | "down";
  /** Where the new group goes relative to what's there; defaults to the board's direction */
  placement?: "right" | "below";
  /** Another board's elements to copy the style from ("in the style of my X board") */
  styleFrom?: El[];
};

/** Named colors → Excalidraw's palette (background fill and a matching stroke) */
const PALETTE: Record<string, { bg: string; stroke: string }> = {
  yellow: { bg: "#ffec99", stroke: "#f08c00" },
  orange: { bg: "#ffd8a8", stroke: "#e8590c" },
  red: { bg: "#ffc9c9", stroke: "#e03131" },
  pink: { bg: "#fcc2d7", stroke: "#c2255c" },
  purple: { bg: "#d0bfff", stroke: "#6741d9" },
  blue: { bg: "#a5d8ff", stroke: "#1971c2" },
  teal: { bg: "#96f2d7", stroke: "#0c8599" },
  green: { bg: "#b2f2bb", stroke: "#2f9e44" },
  gray: { bg: "#e9ecef", stroke: "#868e96" },
  black: { bg: "transparent", stroke: "#1e1e1e" },
  none: { bg: "transparent", stroke: "#1e1e1e" },
};
const colorOf = (c: string | undefined) => {
  if (!c) return null;
  const k = c.trim().toLowerCase();
  if (PALETTE[k]) return PALETTE[k];
  if (/^#[0-9a-f]{3,8}$/i.test(k)) return { bg: k, stroke: k };
  return null;
};

const FONT_SIZE = { s: 16, m: 20, l: 28, xl: 36 } as const;

// ---------- Reading a board's style ----------

const mode = <T>(xs: T[], fallback: T): T => {
  const n = new Map<string, { v: T; c: number }>();
  for (const x of xs) {
    const k = JSON.stringify(x);
    n.set(k, { v: x, c: (n.get(k)?.c ?? 0) + 1 });
  }
  let best: { v: T; c: number } | null = null;
  for (const e of n.values()) if (!best || e.c > best.c) best = e;
  return best ? best.v : fallback;
};
const median = (xs: number[], fallback: number) => {
  if (!xs.length) return fallback;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export type Style = ReturnType<typeof styleProfile>;

/**
 * How the board is drawn: the most common stroke, fill, roughness, corners, font and sizes, how big boxes usually
 * are, how far apart they sit, and which way arrows run. New items copy this so they look like they belong.
 */
export function styleProfile(all: El[]) {
  const els = all.filter((e) => !e.isDeleted);
  const shapes = els.filter((e) => ["rectangle", "ellipse", "diamond"].includes(e.type));
  const texts = els.filter((e) => e.type === "text");
  const free = texts.filter((e) => !e.containerId);
  const arrows = els.filter((e) => e.type === "arrow");
  const lined = [...shapes, ...arrows];
  const sizes = free.map((t) => t.fontSize as number).filter(Boolean);
  const body = median(texts.map((t) => t.fontSize as number).filter(Boolean), 20);
  const heading = sizes.length ? Math.max(...sizes) : 28;
  // Typical gap between a box and its nearest neighbour
  const gaps: number[] = [];
  for (const a of shapes) {
    let best = Infinity;
    for (const b of shapes) {
      if (a === b) continue;
      const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
      const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
      const d = Math.max(dx, dy);
      if (d > 0 && d < best) best = d;
    }
    if (best < 600) gaps.push(best);
  }
  const horizontal = arrows.filter((a) => {
    const p = (a.points as [number, number][]) ?? [];
    const end = p[p.length - 1] ?? [0, 0];
    return Math.abs(end[0]) >= Math.abs(end[1]);
  }).length;
  // Boxes laid out mostly side by side or stacked?
  const xs = shapes.map((s) => s.x + s.width / 2);
  const ys = shapes.map((s) => s.y + s.height / 2);
  const spread = (v: number[]) => (v.length ? Math.max(...v) - Math.min(...v) : 0);
  const direction: "right" | "down" = arrows.length ? (horizontal >= arrows.length - horizontal ? "right" : "down") : spread(ys) > spread(xs) * 1.3 ? "down" : "right";
  const fills = shapes.map((s) => s.backgroundColor as string);
  return {
    hasContent: els.length > 0,
    strokeColor: mode(lined.map((e) => e.strokeColor as string), "#1e1e1e"),
    backgroundColor: mode(fills.length ? fills : [], "transparent"),
    /** Every fill color used, most common first (so items can rotate through the board's own colors) */
    fills: [...new Set(fills.filter((f) => f && f !== "transparent"))],
    fillStyle: mode(shapes.map((e) => e.fillStyle as string), "solid"),
    strokeWidth: mode(lined.map((e) => e.strokeWidth as number), 2),
    strokeStyle: mode(lined.map((e) => e.strokeStyle as string), "solid"),
    roughness: mode(lined.map((e) => e.roughness as number), 1),
    rounded: mode(
      shapes.filter((s) => s.type === "rectangle").map((s) => !!s.roundness),
      true,
    ),
    shape: mode(shapes.map((s) => s.type as "rectangle" | "ellipse" | "diamond"), "rectangle" as const),
    fontFamily: mode(texts.map((t) => t.fontFamily as number), 5),
    textColor: mode(free.map((t) => t.strokeColor as string), "#1e1e1e"),
    fontSize: body,
    headingSize: Math.max(heading, body),
    boxWidth: Math.round(median(shapes.map((s) => s.width), 200)),
    boxHeight: Math.round(median(shapes.map((s) => s.height), 80)),
    gap: Math.round(Math.min(160, Math.max(40, median(gaps, 80)))),
    direction,
    bounds: els.length
      ? {
          minX: Math.min(...els.map((e) => e.x)),
          minY: Math.min(...els.map((e) => e.y)),
          maxX: Math.max(...els.map((e) => e.x + Math.abs(e.width))),
          maxY: Math.max(...els.map((e) => e.y + Math.abs(e.height))),
        }
      : null,
  };
}

/** The style profile for agents to read, in plain words and values */
export function describeStyle(s: Style) {
  return {
    strokeColor: s.strokeColor,
    fillColors: s.fills.length ? s.fills : [s.backgroundColor],
    fillStyle: s.fillStyle,
    strokeWidth: s.strokeWidth,
    strokeStyle: s.strokeStyle,
    roughness: s.roughness === 0 ? "0 (clean lines)" : s.roughness === 1 ? "1 (hand-drawn)" : `${s.roughness} (sketchy)`,
    corners: s.rounded ? "rounded" : "sharp",
    usualShape: s.shape,
    font: s.fontFamily === 5 || s.fontFamily === 1 ? "hand-drawn (Excalifont)" : s.fontFamily === 6 || s.fontFamily === 2 ? "normal (Nunito)" : s.fontFamily === 8 || s.fontFamily === 3 ? "code (Comic Shanns)" : `family ${s.fontFamily}`,
    textSize: s.fontSize,
    headingSize: s.headingSize,
    usualBox: `${s.boxWidth}×${s.boxHeight}`,
    spacing: s.gap,
    direction: s.direction === "right" ? "left to right" : "top to bottom",
  };
}

// ---------- Making elements ----------

const rand = () => Math.floor(Math.random() * 2 ** 31);
const newId = () => {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let s = "";
  for (let i = 0; i < 21; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};

/** Rough text size for Excalidraw's fonts (no browser here to measure); Excalidraw tidies it on first edit */
function measure(text: string, fontSize: number) {
  const lines = text.split("\n");
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { width: Math.ceil(longest * fontSize * 0.56), height: Math.ceil(lines.length * fontSize * 1.25) };
}

/** Breaks long text into lines of about `chars` characters */
function wrap(text: string, chars: number) {
  return text
    .split("\n")
    .map((para) => {
      const words = para.split(/\s+/);
      const out: string[] = [];
      let line = "";
      for (const w of words) {
        if (line && (line + " " + w).length > chars) {
          out.push(line);
          line = w;
        } else line = line ? `${line} ${w}` : w;
      }
      out.push(line);
      return out.join("\n");
    })
    .join("\n");
}

function base(type: string, x: number, y: number, width: number, height: number, s: Style, extra: Record<string, any> = {}): El {
  return {
    id: newId(),
    type,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    angle: 0,
    strokeColor: s.strokeColor,
    backgroundColor: "transparent",
    fillStyle: s.fillStyle,
    strokeWidth: s.strokeWidth,
    strokeStyle: s.strokeStyle,
    roughness: s.roughness,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: rand(),
    version: 1,
    versionNonce: rand(),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    ...extra,
  };
}

function textEl(text: string, x: number, y: number, fontSize: number, s: Style, extra: Record<string, any> = {}): El {
  const m = measure(text, fontSize);
  return base("text", x, y, m.width, m.height, s, {
    strokeColor: s.textColor,
    text,
    originalText: text,
    fontSize,
    fontFamily: s.fontFamily,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    autoResize: true,
    lineHeight: 1.25,
    ...extra,
  });
}

/** A labelled box (or ellipse/diamond) sized to fit its label, with the label bound inside it */
function boxWithLabel(shape: "rectangle" | "ellipse" | "diamond", label: string, w0: number | undefined, h0: number | undefined, fill: string, stroke: string, s: Style, sticky = false) {
  const fontSize = s.fontSize;
  const text = wrap(label, sticky ? 22 : Math.max(14, Math.round((w0 ?? s.boxWidth) / (fontSize * 0.56)) - 3));
  const m = measure(text, fontSize);
  const pad = shape === "rectangle" ? 24 : 48;
  const width = Math.max(w0 ?? (sticky ? 220 : s.boxWidth), m.width + pad * 2);
  const height = Math.max(h0 ?? (sticky ? 180 : s.boxHeight), m.height + pad * (shape === "diamond" ? 2.4 : 1.6));
  const box = base(shape, 0, 0, width, height, s, {
    backgroundColor: fill,
    strokeColor: stroke,
    roundness: shape === "rectangle" ? (s.rounded || sticky ? { type: 3 } : null) : shape === "diamond" ? { type: 2 } : { type: 2 },
    ...(sticky ? { fillStyle: "solid", strokeColor: "transparent" } : {}),
  });
  const parts: El[] = [box];
  if (label.trim()) {
    const t = textEl(text, 0, 0, fontSize, s, {
      containerId: box.id,
      textAlign: sticky ? "left" : "center",
      verticalAlign: sticky ? "top" : "middle",
      strokeColor: s.textColor,
    });
    box.boundElements = [{ type: "text", id: t.id }];
    parts.push(t);
  }
  return parts;
}

/** Moves an element group (a box and its label) so the box's top-left sits at x, y */
function place(parts: El[], x: number, y: number, sticky = false) {
  const [box, label] = parts;
  box.x = Math.round(x);
  box.y = Math.round(y);
  if (label) {
    label.x = Math.round(sticky ? x + 20 : x + (box.width - label.width) / 2);
    label.y = Math.round(sticky ? y + 18 : y + (box.height - label.height) / 2);
  }
}

/** Where the line from a box's centre towards a point leaves the box (plus a small gap) */
function edgePoint(b: El, toward: { x: number; y: number }, gap = 8) {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? (b.width / 2 + gap) / Math.abs(dx) : Infinity;
  const sy = dy ? (b.height / 2 + gap) / Math.abs(dy) : Infinity;
  const k = Math.min(sx, sy);
  return { x: cx + dx * k, y: cy + dy * k };
}

/** bend: how far (px) the middle of the arrow bows out to the side, so two arrows between the same boxes don't overlap */
function arrowBetween(a: El, b: El, s: Style, label?: string, dashed?: boolean, bend = 0): El[] {
  const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
  const nx = (-(cb.y - ca.y) / len) * bend;
  const ny = ((cb.x - ca.x) / len) * bend;
  const p1 = edgePoint(a, { x: cb.x + nx, y: cb.y + ny });
  const p2 = edgePoint(b, { x: ca.x + nx, y: ca.y + ny });
  const mid = [Math.round((p2.x - p1.x) / 2 + nx), Math.round((p2.y - p1.y) / 2 + ny)];
  const arrow = base("arrow", p1.x, p1.y, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y), s, {
    points: bend
      ? [[0, 0], mid, [Math.round(p2.x - p1.x), Math.round(p2.y - p1.y)]]
      : [
          [0, 0],
          [Math.round(p2.x - p1.x), Math.round(p2.y - p1.y)],
        ],
    lastCommittedPoint: null,
    startBinding: { elementId: a.id, focus: 0, gap: 8 },
    endBinding: { elementId: b.id, focus: 0, gap: 8 },
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
    roundness: { type: 2 },
    ...(dashed ? { strokeStyle: "dashed" } : {}),
  });
  a.boundElements = [...(a.boundElements ?? []), { type: "arrow", id: arrow.id }];
  b.boundElements = [...(b.boundElements ?? []), { type: "arrow", id: arrow.id }];
  const out = [arrow];
  if (label?.trim()) {
    const fs = Math.max(14, s.fontSize - 4);
    const m = measure(label, fs);
    const t = textEl(label, (p1.x + p2.x) / 2 + nx - m.width / 2, (p1.y + p2.y) / 2 + ny - m.height / 2, fs, s, { containerId: arrow.id, textAlign: "center", verticalAlign: "middle" });
    arrow.boundElements = [{ type: "text", id: t.id }];
    out.push(t);
  }
  return out;
}

type Node = { key: string; parts: El[]; w: number; h: number; sticky?: boolean; heading?: boolean; fixed?: { x: number; y: number }; file?: { id: string; url: string; mimeType: string } };

/**
 * Turns items into Excalidraw elements placed beside the board's existing content.
 * `existing` is the board's current elements (they're only read, except arrows binding onto existing shapes,
 * which get the arrow added to their boundElements and a version bump).
 */
export function draw(items: Item[], existing: El[], opts: Options = {}) {
  // The look comes from this board, or from another board when asked; placement always from this one
  const own = styleProfile(existing);
  const s = opts.styleFrom ? { ...styleProfile(opts.styleFrom), bounds: own.bounds, hasContent: own.hasContent } : own;
  const live = existing.filter((e) => !e.isDeleted);
  const byId = new Map(live.map((e) => [e.id, e]));
  const labelOf = (e: El) => {
    // Wrapped labels read as one line
    const flat = (x: El) => String(x.originalText ?? x.text ?? "").replace(/\s+/g, " ").trim();
    if (e.type === "text") return flat(e);
    const t = (e.boundElements ?? []).find((b: any) => b.type === "text");
    const te = t ? byId.get(t.id) : null;
    return te ? flat(te) : "";
  };

  const nodes: Node[] = [];
  const local = new Map<string, Node>();
  let colorTurn = 0;
  const files: { id: string; url: string; mimeType: string }[] = [];

  for (const [i, it] of items.entries()) {
    if (it.type === "arrow") continue;
    const key = it.id ?? `#${i}`;
    let node: Node;
    if (it.type === "text") {
      // xl = the board's heading size, l = a subheading between that and the text size
      const sub = Math.round(s.fontSize + (s.headingSize - s.fontSize) * 0.6);
      const fontSize =
        it.fontSize ??
        (it.size === "xl" ? Math.max(FONT_SIZE.xl, s.headingSize) : it.size === "l" ? Math.max(FONT_SIZE.l, sub) : it.size ? FONT_SIZE[it.size] : s.fontSize);
      const c = colorOf(it.color);
      const t = textEl(it.x !== undefined ? it.text : wrap(it.text, it.size === "xl" ? 40 : 60), 0, 0, fontSize, s, c ? { strokeColor: c.stroke } : {});
      if (it.link) t.link = it.link;
      node = { key, parts: [t], w: t.width, h: t.height, heading: it.size === "l" || it.size === "xl" };
    } else if (it.type === "image") {
      const fileId = newId();
      const w = it.width ?? 320;
      const h = it.height ?? Math.round(w * 0.5625);
      const img = base("image", 0, 0, w, h, s, { fileId, status: "saved", scale: [1, 1], strokeColor: "transparent", crop: null });
      const ext = (it.url.split("?")[0].split(".").pop() ?? "").toLowerCase();
      const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : ext === "svg" ? "image/svg+xml" : "image/jpeg";
      node = { key, parts: [img], w, h, file: { id: fileId, url: it.url, mimeType } };
      files.push(node.file!);
    } else {
      const sticky = it.type === "sticky";
      const c = colorOf(it.color);
      // Without a color: stickies are yellow; boxes use the board's own fills in turn (or its usual fill)
      const fill = c?.bg ?? (sticky ? PALETTE.yellow.bg : s.fills.length ? s.fills[colorTurn++ % s.fills.length] : s.backgroundColor);
      const stroke = c && c.stroke !== c.bg ? c.stroke : c ? s.strokeColor : s.strokeColor;
      const shape = it.type === "shape" ? (it.shape ?? s.shape) : "rectangle";
      const parts = boxWithLabel(shape, sticky ? it.text : (it.label ?? ""), it.type === "shape" ? it.width : undefined, it.type === "shape" ? it.height : undefined, fill, stroke, s, sticky);
      if (it.type === "shape" && it.link) parts[0].link = it.link;
      node = { key, parts, w: parts[0].width, h: parts[0].height, sticky };
    }
    if ("x" in it && it.x !== undefined && it.y !== undefined) node.fixed = { x: it.x, y: it.y };
    nodes.push(node);
    local.set(key, node);
  }

  // Arrows: from/to name a new item's id, an existing element id, or an existing label (case-insensitive)
  const resolve = (ref: string): { node?: Node; el?: El } | null => {
    if (local.has(ref)) return { node: local.get(ref)! };
    if (byId.has(ref)) {
      const e = byId.get(ref)!;
      return { el: e.containerId ? (byId.get(e.containerId) ?? e) : e };
    }
    const want = ref.trim().toLowerCase();
    const hit = live.find((e) => e.type !== "arrow" && !(e.type === "text" && e.containerId) && labelOf(e).toLowerCase() === want);
    if (hit) return { el: hit };
    const loose = live.find((e) => e.type !== "arrow" && !(e.type === "text" && e.containerId) && labelOf(e).toLowerCase().includes(want));
    return loose ? { el: loose } : null;
  };
  const links: { from: { node?: Node; el?: El }; to: { node?: Node; el?: El }; label?: string; dashed?: boolean }[] = [];
  const missing: string[] = [];
  for (const it of items) {
    if (it.type !== "arrow") continue;
    const from = resolve(it.from);
    const to = resolve(it.to);
    if (!from) missing.push(it.from);
    if (!to) missing.push(it.to);
    if (from && to) links.push({ from, to, label: it.label, dashed: it.dashed });
  }
  if (missing.length) throw new Error(`Arrow ends not found: ${[...new Set(missing)].map((m) => `"${m}"`).join(", ")}. Use a new item's id, an element id, or the exact label of something on the board.`);

  // ---- Layout ----
  const direction = opts.direction ?? s.direction;
  const inner = links.filter((l) => l.from.node && l.to.node);
  const layout = !opts.layout || opts.layout === "auto" ? (inner.length ? "flow" : nodes.every((n) => n.sticky) ? "grid" : direction === "down" ? "column" : "row") : opts.layout;
  const gap = s.gap;
  const pos = new Map<Node, { x: number; y: number }>();
  // Headings sit above the group; everything else is laid out under them
  const headings = nodes.filter((n) => !n.fixed && n.heading);
  const free = nodes.filter((n) => !n.fixed && !n.heading);
  if (layout === "flow") {
    // Layers by longest path from the starts, so a flowchart reads in one direction. Loops ("no, go back")
    // are found first and left out of the layering so they don't stretch the chart.
    const linked = new Set(inner.flatMap((l) => [l.from.node!, l.to.node!]));
    const flowNodes = free.filter((n) => linked.has(n));
    const out = new Map<Node, Node[]>(flowNodes.map((n) => [n, []]));
    for (const l of inner) out.get(l.from.node!)?.push(l.to.node!);
    const back = new Set<string>();
    const state = new Map<Node, 1 | 2>();
    const visit = (n: Node) => {
      state.set(n, 1);
      for (const m of out.get(n) ?? []) {
        if (state.get(m) === 1) back.add(`${n.key}>${m.key}`);
        else if (!state.has(m)) visit(m);
      }
      state.set(n, 2);
    };
    const hasIn = new Set(inner.map((l) => l.to.node!));
    for (const n of flowNodes.filter((x) => !hasIn.has(x))) if (!state.has(n)) visit(n);
    for (const n of flowNodes) if (!state.has(n)) visit(n);
    const level = new Map<Node, number>(flowNodes.map((n) => [n, 0]));
    for (let pass = 0; pass < flowNodes.length; pass++)
      for (const l of inner) {
        const a = l.from.node!;
        const b = l.to.node!;
        if (back.has(`${a.key}>${b.key}`)) continue;
        if (level.get(b)! < level.get(a)! + 1) level.set(b, level.get(a)! + 1);
      }
    const layers: Node[][] = [];
    for (const n of flowNodes) (layers[level.get(n)!] ??= []).push(n);
    let along = 0;
    for (const layer of layers.filter(Boolean)) {
      const thick = Math.max(...layer.map((n) => (direction === "right" ? n.w : n.h)));
      const total = layer.reduce((t, n) => t + (direction === "right" ? n.h : n.w), 0) + gap * 0.75 * (layer.length - 1);
      let across = -total / 2;
      for (const n of layer) {
        const size = direction === "right" ? n.h : n.w;
        const offset = (thick - (direction === "right" ? n.w : n.h)) / 2;
        pos.set(n, direction === "right" ? { x: along + offset, y: across } : { x: across, y: along + offset });
        across += size + gap * 0.75;
      }
      along += thick + gap * 1.5;
    }
    // Things not on the flow (notes, headings) go in a row underneath it (or beside it when it runs down)
    const rest = free.filter((n) => !linked.has(n));
    if (rest.length) {
      const flowPos = [...pos.entries()];
      const far = flowPos.length
        ? direction === "right"
          ? Math.max(...flowPos.map(([n, p]) => p.y + n.h))
          : Math.max(...flowPos.map(([n, p]) => p.x + n.w))
        : 0;
      const start = flowPos.length ? (direction === "right" ? Math.min(...flowPos.map(([, p]) => p.x)) : Math.min(...flowPos.map(([, p]) => p.y))) : 0;
      let cursor = start;
      for (const n of rest) {
        pos.set(n, direction === "right" ? { x: cursor, y: far + gap } : { x: far + gap, y: cursor });
        cursor += (direction === "right" ? n.w : n.h) + gap * 0.5;
      }
    }
  } else if (layout === "grid") {
    const cols = Math.max(1, Math.ceil(Math.sqrt(free.length)));
    const cw = Math.max(0, ...free.map((n) => n.w));
    const ch = Math.max(0, ...free.map((n) => n.h));
    free.forEach((n, i) => pos.set(n, { x: (i % cols) * (cw + gap * 0.5), y: Math.floor(i / cols) * (ch + gap * 0.5) }));
  } else {
    // row / column, wrapping long rows; text items start a new line in a column
    let x = 0;
    let y = 0;
    let lineSize = 0;
    for (const n of free) {
      if (layout === "row") {
        if (x > 0 && x + n.w > 1600) {
          x = 0;
          y += lineSize + gap;
          lineSize = 0;
        }
        pos.set(n, { x, y });
        x += n.w + gap;
        lineSize = Math.max(lineSize, n.h);
      } else {
        pos.set(n, { x, y });
        y += n.h + gap * 0.6;
      }
    }
  }
  if (headings.length) {
    const top = Math.min(0, ...[...pos.values()].map((p) => p.y));
    const left = Math.min(0, ...[...pos.values()].map((p) => p.x));
    const tall = headings.reduce((t, n) => t + n.h + gap * 0.3, 0) + gap * 0.4;
    for (const [n, p] of pos) pos.set(n, { x: p.x, y: p.y - top + tall });
    let y = 0;
    for (const n of headings) {
      pos.set(n, { x: left === 0 ? 0 : 0, y });
      y += n.h + gap * 0.3;
    }
    // Keep the rest aligned with the heading's left edge
    for (const [n, p] of pos) if (!n.heading) pos.set(n, { x: p.x - left, y: p.y });
  }
  // Normalise the group to start at 0,0, then put it beside the existing content
  const placed = [...pos.entries()];
  const minX = Math.min(0, ...placed.map(([, p]) => p.x));
  const minY = Math.min(0, ...placed.map(([, p]) => p.y));
  const placement = opts.placement ?? (direction === "down" ? "below" : "right");
  const origin = !s.bounds
    ? { x: 0, y: 0 }
    : placement === "right"
      ? { x: s.bounds.maxX + gap * 1.5, y: s.bounds.minY }
      : { x: s.bounds.minX, y: s.bounds.maxY + gap * 1.5 };
  for (const [n, p] of placed) place(n.parts, origin.x + p.x - minX, origin.y + p.y - minY, n.sticky);
  // Items with their own x, y are placed relative to the same origin
  for (const n of nodes) if (n.fixed) place(n.parts, origin.x + n.fixed.x, origin.y + n.fixed.y, n.sticky);

  // ---- Arrows (after layout, so they meet the boxes where they ended up) ----
  const touched = new Map<string, El>();
  const out: El[] = nodes.flatMap((n) => n.parts);
  const pairs = new Map<string, number>();
  for (const l of links) {
    const a = l.from.node?.parts[0] ?? l.from.el!;
    const b = l.to.node?.parts[0] ?? l.to.el!;
    // Existing shapes are copied before changing (they get the arrow in boundElements and a new version)
    const own = (e: El) => {
      if (!byId.has(e.id)) return e;
      if (!touched.has(e.id)) touched.set(e.id, { ...e, boundElements: [...(e.boundElements ?? [])], version: (e.version ?? 1) + 1, versionNonce: rand(), updated: Date.now() });
      return touched.get(e.id)!;
    };
    // A second arrow between the same two things (either way) bows out so both stay visible
    const pair = [a.id, b.id].sort().join("|");
    const nth = pairs.get(pair) ?? 0;
    pairs.set(pair, nth + 1);
    out.push(...arrowBetween(own(a), own(b), s, l.label, l.dashed, nth ? 40 * Math.ceil(nth / 2) * (nth % 2 ? 1 : -1) : 0));
  }
  return { added: out, changed: [...touched.values()], files, style: s, ids: Object.fromEntries(nodes.map((n) => [n.key, n.parts[0].id])) };
}

/** Plain list of what's on a board, for agents to refer to (ids, kinds, labels, positions, colors) */
export function itemsOf(all: El[]) {
  const els = all.filter((e) => !e.isDeleted);
  const byId = new Map(els.map((e) => [e.id, e]));
  const label = (e: El) => {
    // Wrapped labels read as one line
    const flat = (x: El) => String(x.originalText ?? x.text ?? "").replace(/\s+/g, " ").trim();
    if (e.type === "text") return flat(e);
    const t = (e.boundElements ?? []).find((b: any) => b.type === "text");
    const te = t ? byId.get(t.id) : null;
    return te ? flat(te) : "";
  };
  return els
    .filter((e) => !(e.type === "text" && e.containerId))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, 400)
    .map((e) => ({
      id: e.id,
      kind: e.type === "rectangle" && e.backgroundColor === "#ffec99" && e.strokeColor === "transparent" ? "sticky" : e.type,
      label: label(e).slice(0, 200),
      x: Math.round(e.x),
      y: Math.round(e.y),
      w: Math.round(e.width),
      h: Math.round(e.height),
      ...(e.backgroundColor && e.backgroundColor !== "transparent" ? { fill: e.backgroundColor } : {}),
      ...(e.type === "arrow"
        ? {
            from: e.startBinding?.elementId ? label(byId.get(e.startBinding.elementId) ?? (e as El)) || e.startBinding.elementId : null,
            to: e.endBinding?.elementId ? label(byId.get(e.endBinding.elementId) ?? (e as El)) || e.endBinding.elementId : null,
          }
        : {}),
      ...(e.link ? { link: e.link } : {}),
    }));
}

export type EditOp =
  | { op: "setText"; id: string; text: string }
  | { op: "setColor"; id: string; color: string }
  | { op: "move"; id: string; dx: number; dy: number }
  | { op: "delete"; id: string };

/**
 * Small changes to existing elements by id. Deleted elements are kept as deleted (with a new version) so an
 * open editor removes them too; arrows and labels attached to a deleted shape go with it.
 */
export function edit(all: El[], ops: EditOp[]) {
  const els = all.map((e) => ({ ...e }));
  const byId = new Map(els.map((e) => [e.id, e]));
  const bump = (e: El) => {
    e.version = (e.version ?? 1) + 1;
    e.versionNonce = rand();
    e.updated = Date.now();
  };
  const labelEl = (e: El) => {
    if (e.type === "text") return e;
    const t = (e.boundElements ?? []).find((b: any) => b.type === "text");
    return t ? byId.get(t.id) : undefined;
  };
  const reshaped = new Set<string>();
  for (const o of ops) {
    const e = byId.get(o.id);
    if (!e || e.isDeleted) throw new Error(`No element with id ${o.id}. Read the board again (get_board) for current ids.`);
    if (o.op === "setText") {
      const t = labelEl(e);
      if (!t) throw new Error(`Element ${o.id} has no text to change.`);
      const box = t.containerId ? byId.get(t.containerId) : null;
      const fs = t.fontSize ?? 20;
      // A label keeps its box's width and wraps; the box only grows taller if it has to
      const text = box && box.type !== "arrow" ? wrap(o.text, Math.max(8, Math.floor((box.width - 48) / (fs * 0.56)))) : o.text;
      t.text = text;
      t.originalText = text;
      const m = measure(text, fs);
      t.width = m.width;
      t.height = m.height;
      if (box && box.type !== "arrow") {
        box.width = Math.max(box.width, m.width + 48);
        box.height = Math.max(box.height, m.height + 32);
        t.x = Math.round(box.x + (box.width - t.width) / 2);
        t.y = Math.round(box.y + (box.height - t.height) / 2);
        bump(box);
        reshaped.add(box.id);
      }
      bump(t);
    } else if (o.op === "setColor") {
      const c = colorOf(o.color);
      if (!c) throw new Error(`Unknown color "${o.color}". Use ${Object.keys(PALETTE).join(", ")} or a #hex.`);
      if (e.type === "text") e.strokeColor = c.stroke;
      else e.backgroundColor = c.bg;
      bump(e);
    } else if (o.op === "move") {
      const group = [e, ...(e.boundElements ?? []).filter((b: any) => b.type === "text").map((b: any) => byId.get(b.id)).filter(Boolean)] as El[];
      for (const g of group) {
        g.x += o.dx;
        g.y += o.dy;
        bump(g);
      }
      reshaped.add(e.id);
    } else {
      const gone = [e, ...(e.boundElements ?? []).map((b: any) => byId.get(b.id)).filter(Boolean)] as El[];
      for (const g of gone) {
        g.isDeleted = true;
        bump(g);
        for (const t of (g.boundElements ?? []).filter((b: any) => b.type === "text")) {
          const te = byId.get(t.id);
          if (te) {
            te.isDeleted = true;
            bump(te);
          }
        }
      }
    }
  }
  // Arrows attached to boxes that grew or moved are redrawn to meet them again
  for (const a of els) {
    if (a.type !== "arrow" || a.isDeleted) continue;
    const from = a.startBinding?.elementId;
    const to = a.endBinding?.elementId;
    if (!(reshaped.has(from) || reshaped.has(to))) continue;
    const A = byId.get(from);
    const B = byId.get(to);
    if (!A || !B || A.isDeleted || B.isDeleted) continue;
    const ca = { x: A.x + A.width / 2, y: A.y + A.height / 2 };
    const cb = { x: B.x + B.width / 2, y: B.y + B.height / 2 };
    const p1 = edgePoint(A, cb);
    const p2 = edgePoint(B, ca);
    a.x = Math.round(p1.x);
    a.y = Math.round(p1.y);
    a.points = [
      [0, 0],
      [Math.round(p2.x - p1.x), Math.round(p2.y - p1.y)],
    ];
    a.width = Math.abs(Math.round(p2.x - p1.x));
    a.height = Math.abs(Math.round(p2.y - p1.y));
    bump(a);
    const label = (a.boundElements ?? []).find((b: any) => b.type === "text");
    const te = label ? byId.get(label.id) : null;
    if (te) {
      te.x = Math.round((p1.x + p2.x) / 2 - te.width / 2);
      te.y = Math.round((p1.y + p2.y) / 2 - te.height / 2);
      bump(te);
    }
  }
  return els;
}
