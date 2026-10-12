"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Scratchboard: a drawing board in Riley's "drawing board" style (pencil on warm paper), drawn with the
// sketch kit from the style artifact, not Excalidraw. Same keyboard shortcuts as Excalidraw.

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { INK, PALETTE, TEXT, bounds, build, hit, moved, shownText, textWidth, tidyPath, type Drawable, type Item, type Pt, type TextStyle } from "@/lib/scratchDraw";

const FONTS_CSS = "https://fonts.googleapis.com/css2?family=Archivo:wght@500..900&family=Architects+Daughter&family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&display=block";
const DESK = "#2A2928";
const RED = "#E24B3F";

type Tool = "hand" | "select" | "rect" | "diamond" | "ellipse" | "arrow" | "line" | "pen" | "text" | "eraser";
// Excalidraw's shortcuts: letters and the number row
const KEYS: Record<string, Tool> = { h: "hand", v: "select", "1": "select", r: "rect", "2": "rect", d: "diamond", "3": "diamond", o: "ellipse", "4": "ellipse", a: "arrow", "5": "arrow", l: "line", "6": "line", p: "pen", "7": "pen", t: "text", "8": "text", e: "eraser", "0": "eraser" };
const TOOLS: { tool: Tool; label: string; key: string; icon: ReactNode }[] = [
  { tool: "hand", label: "Hand (panning tool)", key: "H", icon: <path d="M7 9.5V4a1 1 0 0 1 2 0v4.5m0-1V3a1 1 0 0 1 2 0v4.5m0-.5V4a1 1 0 0 1 2 0v6.5c0 2.5-1.8 4-4 4H8.6a3 3 0 0 1-2.4-1.2L3.9 10.3a1 1 0 0 1 1.5-1.3L7 10.5" /> },
  { tool: "select", label: "Selection", key: "V or 1", icon: <path d="M4 2.5 12.5 9l-4 .8L10.6 14l-1.6.7-2-4.2-3 2.6z" /> },
  { tool: "rect", label: "Rectangle", key: "R or 2", icon: <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" /> },
  { tool: "diamond", label: "Diamond", key: "D or 3", icon: <path d="M8 2 14 8 8 14 2 8z" /> },
  { tool: "ellipse", label: "Ellipse", key: "O or 4", icon: <circle cx="8" cy="8" r="5.5" /> },
  { tool: "arrow", label: "Arrow", key: "A or 5", icon: <path d="M2.5 13.5c3-1 6-4 10-10M8 3.5h4.5V8" /> },
  { tool: "line", label: "Line", key: "L or 6", icon: <path d="M2.5 13.5 13.5 2.5" /> },
  { tool: "pen", label: "Draw", key: "P or 7", icon: <path d="M11 2.5 13.5 5 6 12.5 2.5 13.5 3.5 10 11 2.5Z" /> },
  { tool: "text", label: "Text", key: "T or 8", icon: <path d="M3 3.5h10M8 3.5v9.5M6 13h4" /> },
  { tool: "eraser", label: "Eraser", key: "E or 0", icon: <path d="M6 13.5h7.5M9.5 3.5l3.5 3.5-6 6.5H5l-2.5-2.5z" /> },
];

const uid = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;
const newSeed = () => Math.floor(Math.random() * 1e6) + 1;

type Cam = { x: number; y: number; z: number };
type Style = { color: string; fill: string | null; tint: boolean; w: number; textStyle: TextStyle; textSize: number | null; corner: boolean };

export function ScratchboardEditor({ id }: { id: string }) {
  const board = useQuery(api.scratchboards.get, { id });
  const save = useMutation(api.scratchboards.save);
  const [S, setS] = useState<any>(null); // the sketch kit (browser only)
  const [fontsReady, setFontsReady] = useState(0);
  const [items, setItemsState] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [tool, setToolState] = useState<Tool>("select");
  const [locked, setLocked] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [style, setStyle] = useState<Style>({ color: INK, fill: null, tint: false, w: 2.6, textStyle: "note", textSize: null, corner: true });
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, z: 1 });
  const camRef = useRef(cam);
  camRef.current = cam;
  const [saving, setSaving] = useState<"saved" | "saving" | "error">("saved");
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(null);
  const [playing, setPlaying] = useState<number | null>(null); // play start time (ms)
  /** Presenting (Excalidraw's zen mode, Alt+Z): no toolbars or panels at all */
  const [zen, setZenState] = useState(false);
  /** The style panel only opens when you ask for it (nothing pops up when you select things) */
  const [panel, setPanelState] = useState(false);
  useEffect(() => {
    try {
      setZenState(localStorage.getItem("sb-zen") === "1");
      setPanelState(localStorage.getItem("sb-panel") === "1");
    } catch {}
  }, []);
  const setZen = (v: boolean) => {
    setZenState(v);
    try {
      localStorage.setItem("sb-zen", v ? "1" : "0");
    } catch {}
  };
  const setPanel = (v: boolean) => {
    setPanelState(v);
    try {
      localStorage.setItem("sb-panel", v ? "1" : "0");
    } catch {}
  };
  // The big pencil from the videos is the cursor
  const pointer = useRef<{ x: number; y: number; down: boolean } | null>(null);
  /** Holding ⌘⇧ turns the pencil red: drag to draw in red, whatever tool is picked */
  const [red, setRed] = useState(false);
  useEffect(() => {
    const check = (e: KeyboardEvent) => setRed((e.metaKey || e.ctrlKey) && e.shiftKey);
    const off = () => setRed(false);
    window.addEventListener("keydown", check);
    window.addEventListener("keyup", check);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", check);
      window.removeEventListener("keyup", check);
      window.removeEventListener("blur", off);
    };
  }, []);
  const overlay = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const draft = useRef<Item | null>(null); // the shape being drawn
  const gesture = useRef<any>(null);
  const spaceDown = useRef(false);
  const clipboard = useRef<Item[]>([]);
  const cache = useRef(new Map<string, { key: string; d: Drawable[] }>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>("");
  const [, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);
  useDocumentTitle(title ?? board?.title ?? "Scratchboard");

  // The kit and the style's fonts
  useEffect(() => {
    void import("@/lib/sketchKit").then((m) => setS(() => m.Sketch));
    if (!document.querySelector(`link[href="${FONTS_CSS}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONTS_CSS;
      document.head.appendChild(l);
    }
    void Promise.all(
      ['900 100px Archivo', '800 40px Archivo', '400 40px "Architects Daughter"', '500 24px "JetBrains Mono"', '700 24px "JetBrains Mono"'].map((f) => document.fonts.load(f, "A0$≈–")),
    ).then(() => {
      cache.current.clear();
      setFontsReady((n) => n + 1);
    });
  }, []);

  // Load once; afterwards take in outside changes (e.g. an agent drew) when we have nothing unsaved
  useEffect(() => {
    if (!board) return;
    if (!loaded) {
      const list = JSON.parse(board.elements || "[]") as Item[];
      itemsRef.current = list;
      setItemsState(list);
      lastSaved.current = board.elements;
      setLoaded(true);
      return;
    }
    if (board.elements !== lastSaved.current && !saveTimer.current && !gesture.current) {
      const list = JSON.parse(board.elements || "[]") as Item[];
      itemsRef.current = list;
      setItemsState(list);
      lastSaved.current = board.elements;
    }
  }, [board, loaded]);

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving("saving");
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null;
      const json = JSON.stringify(itemsRef.current);
      try {
        await save({ id: id as Id<"scratchboards">, elements: json });
        lastSaved.current = json;
        setSaving("saved");
      } catch {
        setSaving("error");
      }
    }, 600);
  }, [id, save]);

  /** Change the drawing (with undo) */
  const commit = useCallback(
    (next: Item[], undoable = true) => {
      if (undoable) {
        history.current.past.push(JSON.stringify(itemsRef.current));
        if (history.current.past.length > 200) history.current.past.shift();
        history.current.future = [];
      }
      itemsRef.current = next;
      setItemsState(next);
      persist();
    },
    [persist],
  );
  const undo = () => {
    const prev = history.current.past.pop();
    if (prev === undefined) return;
    history.current.future.push(JSON.stringify(itemsRef.current));
    const list = JSON.parse(prev);
    itemsRef.current = list;
    setItemsState(list);
    setSel(new Set());
    persist();
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (next === undefined) return;
    history.current.past.push(JSON.stringify(itemsRef.current));
    const list = JSON.parse(next);
    itemsRef.current = list;
    setItemsState(list);
    persist();
  };

  const setTool = (t: Tool) => {
    setToolState(t);
    if (t !== "select") setSel(new Set());
  };

  const toWorld = (sx: number, sy: number): Pt => {
    const c = camRef.current;
    return [(sx - c.x) / c.z, (sy - c.y) / c.z];
  };
  const screenPt = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as Pt;
  };

  const drawablesOf = useCallback(
    (it: Item) => {
      if (!S) return [];
      const key = JSON.stringify(it);
      const hitc = cache.current.get(it.id);
      if (hitc && hitc.key === key) return hitc.d;
      let d: Drawable[] = [];
      try {
        d = build(S, it);
      } catch {}
      cache.current.set(it.id, { key, d });
      return d;
    },
    [S],
  );

  /** Fit the whole drawing on screen */
  const fit = useCallback(
    (only?: Item[]) => {
      const list = only?.length ? only : itemsRef.current;
      const el = wrap.current;
      if (!el) return;
      if (!list.length) return setCam({ x: el.clientWidth / 2, y: el.clientHeight / 2, z: 1 });
      const bs = list.map(bounds);
      const x0 = Math.min(...bs.map((b) => b.x)),
        y0 = Math.min(...bs.map((b) => b.y)),
        x1 = Math.max(...bs.map((b) => b.x + b.w)),
        y1 = Math.max(...bs.map((b) => b.y + b.h));
      const z = Math.min(2, Math.max(0.1, Math.min((el.clientWidth - 160) / Math.max(1, x1 - x0), (el.clientHeight - 200) / Math.max(1, y1 - y0))));
      setCam({ z, x: el.clientWidth / 2 - ((x0 + x1) / 2) * z, y: el.clientHeight / 2 - ((y0 + y1) / 2) * z });
    },
    [],
  );
  const didFit = useRef(false);
  useEffect(() => {
    if (loaded && S && !didFit.current) {
      didFit.current = true;
      fit();
    }
  }, [loaded, S, fit]);

  // ---------- drawing the board ----------
  const paint = useCallback(
    (t?: number) => {
      const cv = canvas.current,
        el = wrap.current;
      if (!cv || !el || !S) return;
      const dpr = window.devicePixelRatio || 1;
      const W = el.clientWidth,
        H = el.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const c = cv.getContext("2d")!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      S.drawPaper(c, W, H);
      const z = camRef.current;
      c.save();
      c.translate(z.x, z.y);
      c.scale(z.z, z.z);
      const list = [...itemsRef.current, ...(draft.current ? [draft.current] : [])].filter((it) => !(editing && it.id === editing.id));
      if (t === undefined) {
        // Fills under lettering under ink, like the style
        const all = list.flatMap((it) => drawablesOf(it));
        for (const layer of [0, 1, 2]) for (const d of all) if (d.layer === layer) d.el.draw(c, 1, 0);
      } else {
        const tl = S.timeline();
        let at = 0.5;
        for (const it of list)
          for (const d of drawablesOf(it)) {
            tl.add(d.el, at, d.dur, { tool: d.tool, layer: d.layer });
            at += d.dur * (d.layer === 0 ? 0.9 : 1) + 0.12;
          }
        tl.render(c, t, { pencilScale: 0.85 / z.z });
      }
      // Selection
      if (t === undefined && sel.size) {
        c.strokeStyle = "#5B8FC7";
        c.lineWidth = 1.5 / z.z;
        c.setLineDash([6 / z.z, 4 / z.z]);
        for (const it of itemsRef.current)
          if (sel.has(it.id)) {
            const b = bounds(it);
            c.strokeRect(b.x - 4 / z.z, b.y - 4 / z.z, b.w + 8 / z.z, b.h + 8 / z.z);
          }
        c.setLineDash([]);
      }
      // Marquee
      const g = gesture.current;
      if (g?.type === "marquee") {
        c.fillStyle = "rgba(91,143,199,0.08)";
        c.strokeStyle = "rgba(91,143,199,0.7)";
        c.lineWidth = 1 / z.z;
        const [x0, y0] = g.start,
          [x1, y1] = g.now;
        c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }
      c.restore();
      S.drawGrain(c, W, H);
    },
    [S, drawablesOf, sel, editing],
  );

  // Static frames: redraw when anything changes
  useEffect(() => {
    if (playing === null) paint();
  });
  useEffect(() => {
    const ro = new ResizeObserver(() => paint());
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [paint]);
  useEffect(() => {
    cache.current.clear();
    redraw();
  }, [fontsReady, redraw]);

  // Play: draw everything again with the pencil, item by item
  const playLen = useCallback(() => itemsRef.current.reduce((n, it) => n + drawablesOf(it).reduce((m, d) => m + d.dur + 0.12, 0), 2.5), [drawablesOf]);
  useEffect(() => {
    if (playing === null) return;
    let raf = 0;
    const len = playLen();
    const tick = () => {
      const t = (performance.now() - playing) / 1000;
      paint(Math.min(t, len));
      if (t < len + 0.5) raf = requestAnimationFrame(tick);
      else setPlaying(null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, paint, playLen]);

  /** The pencil under the pointer, in the color you're drawing with; it lifts when you're not pressing */
  const drawCursor = useCallback(() => {
    const cv = overlay.current,
      el = wrap.current;
    if (!cv || !el) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(el.clientWidth * dpr) || cv.height !== Math.round(el.clientHeight * dpr)) {
      cv.width = Math.round(el.clientWidth * dpr);
      cv.height = Math.round(el.clientHeight * dpr);
    }
    const c = cv.getContext("2d")!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    const p = pointer.current;
    if (!S || !p || playing !== null || (tool === "hand" && !red) || editing) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.drawPencil(c, p.x, p.y, { angle: -0.98, color: red ? RED : tool === "eraser" ? "#F4AE92" : style.color, lift: p.down ? 0 : 8, scale: 0.72 });
  }, [S, tool, style.color, playing, editing, red]);
  useEffect(() => drawCursor());

  // ---------- pointer ----------
  const topHit = (p: Pt) => {
    const tol = 6 / camRef.current.z;
    const list = itemsRef.current;
    for (let i = list.length - 1; i >= 0; i--) if (hit(list[i], p, tol)) return list[i];
    return null;
  };

  const makeItem = (kind: Item["kind"], p: Pt): Item => {
    const base = { id: uid(), seed: newSeed(), color: style.color, w: style.w } as Item;
    const fill = style.fill ? { color: style.fill, tint: style.tint } : null;
    if (kind === "pen") return { ...base, kind, pts: [p] };
    if (kind === "line" || kind === "arrow") return { ...base, kind, a: p, b: p, ...(kind === "arrow" ? { bend: 0.25 } : {}) };
    if (kind === "rect") return { ...base, kind, x: p[0], y: p[1], width: 0, h: 0, r: style.corner ? 22 : 0, fill };
    if (kind === "diamond") return { ...base, kind, x: p[0], y: p[1], width: 0, h: 0, fill };
    if (kind === "ellipse") return { ...base, kind, cx: p[0], cy: p[1], rx: 0, ry: 0, fill };
    return { ...base, kind: "text", style: style.textStyle, text: "", x: p[0], y: p[1], size: style.textSize ?? TEXT[style.textStyle].size, ...(style.textStyle === "big" && style.fill ? { fill: { color: style.fill } } : {}) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (playing !== null) return setPlaying(null);
    if (editing) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const sp = screenPt(e);
    const p = toWorld(sp[0], sp[1]);
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.button === 0) {
      // ⌘⇧-drag: the red pencil
      draft.current = { ...makeItem("pen", p), color: RED };
      gesture.current = { type: "draw", start: p };
      redraw();
      return;
    }
    if (tool === "hand" || spaceDown.current || e.button === 1) {
      gesture.current = { type: "pan", start: sp, cam: { ...camRef.current } };
      return;
    }
    if (tool === "select") {
      const it = topHit(p);
      if (it) {
        const next = new Set(e.shiftKey ? sel : sel.has(it.id) ? sel : []);
        if (e.shiftKey && sel.has(it.id)) next.delete(it.id);
        else next.add(it.id);
        setSel(next);
        // Alt-drag duplicates, like Excalidraw
        let ids = next;
        if (e.altKey) {
          const copies = itemsRef.current.filter((x) => next.has(x.id)).map((x) => ({ ...x, id: uid() }));
          commit([...itemsRef.current, ...copies]);
          ids = new Set(copies.map((x) => x.id));
          setSel(ids);
        }
        gesture.current = { type: "move", start: p, last: p, ids, before: JSON.stringify(itemsRef.current), moved: false };
      } else {
        if (!e.shiftKey) setSel(new Set());
        gesture.current = { type: "marquee", start: p, now: p };
      }
      return;
    }
    if (tool === "eraser") {
      gesture.current = { type: "erase", before: JSON.stringify(itemsRef.current) };
      const it = topHit(p);
      if (it) {
        itemsRef.current = itemsRef.current.filter((x) => x.id !== it.id);
        setItemsState(itemsRef.current);
      }
      return;
    }
    if (tool === "text") {
      // Keep the browser from moving focus off the text box we're about to open
      e.preventDefault();
      const existing = topHit(p);
      if (existing?.kind === "text") return setEditing({ id: existing.id, isNew: false });
      const it = makeItem("text", [p[0], p[1] + (style.textSize ?? TEXT[style.textStyle].size) * 0.35]);
      commit([...itemsRef.current, it]);
      setEditing({ id: it.id, isNew: true });
      if (!locked) setToolState("select");
      return;
    }
    draft.current = makeItem(tool, p);
    gesture.current = { type: "draw", start: p };
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const sp = screenPt(e);
    const p = toWorld(sp[0], sp[1]);
    if (g.type === "pan") {
      setCam({ ...g.cam, x: g.cam.x + sp[0] - g.start[0], y: g.cam.y + sp[1] - g.start[1] });
      return;
    }
    if (g.type === "move") {
      const dx = p[0] - g.last[0],
        dy = p[1] - g.last[1];
      g.last = p;
      g.moved = true;
      itemsRef.current = itemsRef.current.map((it) => (g.ids.has(it.id) ? moved(it, dx, dy) : it));
      setItemsState(itemsRef.current);
      return;
    }
    if (g.type === "marquee") {
      g.now = p;
      const x0 = Math.min(g.start[0], p[0]),
        y0 = Math.min(g.start[1], p[1]),
        x1 = Math.max(g.start[0], p[0]),
        y1 = Math.max(g.start[1], p[1]);
      setSel(new Set(itemsRef.current.filter((it) => {
        const b = bounds(it);
        return b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1;
      }).map((it) => it.id)));
      return;
    }
    if (g.type === "erase") {
      const it = topHit(p);
      if (it) {
        itemsRef.current = itemsRef.current.filter((x) => x.id !== it.id);
        setItemsState(itemsRef.current);
      }
      return;
    }
    const d = draft.current;
    if (!d) return;
    let [x0, y0] = g.start;
    let [x, y] = p;
    if (d.kind === "pen") {
      d.pts = [...(d.pts ?? []), p];
    } else if (d.kind === "line" || d.kind === "arrow") {
      if (e.shiftKey) {
        // Snap to 15° steps
        const ang = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 12)) * (Math.PI / 12),
          L = Math.hypot(x - x0, y - y0);
        x = x0 + Math.cos(ang) * L;
        y = y0 + Math.sin(ang) * L;
      }
      d.b = [x, y];
    } else {
      let w = x - x0,
        h = y - y0;
      if (e.shiftKey) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }
      if (e.altKey) {
        x0 -= w;
        y0 -= h;
        w *= 2;
        h *= 2;
      }
      if (d.kind === "ellipse") {
        d.cx = x0 + w / 2;
        d.cy = y0 + h / 2;
        d.rx = Math.abs(w / 2);
        d.ry = Math.abs(h / 2);
      } else {
        d.x = x0;
        d.y = y0;
        d.width = w;
        d.h = h;
      }
    }
    draft.current = { ...d };
    redraw();
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.type === "move" && g.moved) {
      history.current.past.push(g.before);
      history.current.future = [];
      persist();
    }
    if (g.type === "erase" && JSON.stringify(itemsRef.current) !== g.before) {
      history.current.past.push(g.before);
      history.current.future = [];
      persist();
    }
    if (g.type === "draw" && draft.current) {
      let d = draft.current;
      draft.current = null;
      const b = bounds(d);
      const tiny = (d.kind === "pen" ? (d.pts?.length ?? 0) < 2 : b.w < 8 && b.h < 8);
      if (!tiny) {
        if (d.kind === "pen") d = { ...d, pts: tidyPath(d.pts ?? []) };
        commit([...itemsRef.current, d]);
        if (d.kind !== "pen" && !locked) {
          setToolState("select");
          setSel(new Set([d.id]));
        }
      }
      redraw();
    }
    if (g.type === "marquee") redraw();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const sp = screenPt(e);
    const p = toWorld(sp[0], sp[1]);
    const it = topHit(p);
    if (it?.kind === "text") return setEditing({ id: it.id, isNew: false });
    if (!it) {
      const t = makeItem("text", [p[0], p[1] + (style.textSize ?? TEXT[style.textStyle].size) * 0.35]);
      commit([...itemsRef.current, t]);
      setEditing({ id: t.id, isNew: true });
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const sp = screenPt(e);
    const c = camRef.current;
    if (e.ctrlKey || e.metaKey) {
      const z = Math.min(8, Math.max(0.1, c.z * Math.exp(-e.deltaY * 0.01)));
      setCam({ z, x: sp[0] - ((sp[0] - c.x) * z) / c.z, y: sp[1] - ((sp[1] - c.y) * z) / c.z });
    } else setCam({ ...c, x: c.x - (e.shiftKey ? e.deltaY : e.deltaX), y: c.y - (e.shiftKey ? 0 : e.deltaY) });
  };
  // Stop the page itself zooming on ctrl+wheel / pinch
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const zoomBy = (k: number) => {
    const el = wrap.current!;
    const c = camRef.current;
    const z = Math.min(8, Math.max(0.1, c.z * k));
    const sx = el.clientWidth / 2,
      sy = el.clientHeight / 2;
    setCam({ z, x: sx - ((sx - c.x) * z) / c.z, y: sy - ((sy - c.y) * z) / c.z });
  };

  /** Change the selected things' style (and what's drawn next) */
  const restyle = (patch: Partial<Style>, itemPatch: (it: Item) => Partial<Item> | null) => {
    setStyle((s) => ({ ...s, ...patch }));
    if (!sel.size) return;
    commit(itemsRef.current.map((it) => (sel.has(it.id) ? { ...it, ...(itemPatch(it) ?? {}) } : it)));
  };

  // ---------- keyboard: Excalidraw's shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.key === " ") {
        spaceDown.current = true;
        e.preventDefault();
        return;
      }
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        redo();
      } else if (mod && k === "a") {
        e.preventDefault();
        setToolState("select");
        setSel(new Set(itemsRef.current.map((it) => it.id)));
      } else if (mod && k === "d") {
        e.preventDefault();
        const copies = itemsRef.current.filter((it) => sel.has(it.id)).map((it) => moved({ ...it, id: uid() }, 20, 20));
        if (copies.length) {
          commit([...itemsRef.current, ...copies]);
          setSel(new Set(copies.map((c) => c.id)));
        }
      } else if (mod && (k === "c" || k === "x")) {
        const chosen = itemsRef.current.filter((it) => sel.has(it.id));
        if (!chosen.length) return;
        e.preventDefault();
        clipboard.current = chosen;
        void navigator.clipboard?.writeText(JSON.stringify({ scratchboard: chosen })).catch(() => {});
        if (k === "x") {
          commit(itemsRef.current.filter((it) => !sel.has(it.id)));
          setSel(new Set());
        }
      } else if (mod && k === "v") {
        if (!clipboard.current.length) return;
        e.preventDefault();
        const copies = clipboard.current.map((it) => moved({ ...it, id: uid() }, 24, 24));
        clipboard.current = copies;
        commit([...itemsRef.current, ...copies]);
        setSel(new Set(copies.map((c) => c.id)));
      } else if (mod && (e.key === "]" || e.key === "[")) {
        // Bring forward / send backward (shift: all the way)
        e.preventDefault();
        const list = [...itemsRef.current];
        const chosen = list.filter((it) => sel.has(it.id));
        const rest = list.filter((it) => !sel.has(it.id));
        if (e.shiftKey) commit(e.key === "]" ? [...rest, ...chosen] : [...chosen, ...rest]);
        else {
          const step = e.key === "]" ? 1 : -1;
          const arr = [...list];
          const idxs = arr.map((it, i) => (sel.has(it.id) ? i : -1)).filter((i) => i >= 0);
          for (const i of step > 0 ? idxs.reverse() : idxs) {
            const j = i + step;
            if (j < 0 || j >= arr.length || sel.has(arr[j].id)) continue;
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          commit(arr);
        }
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomBy(1.2);
      } else if (mod && e.key === "-") {
        e.preventDefault();
        zoomBy(1 / 1.2);
      } else if (mod && e.key === "0") {
        e.preventDefault();
        const el = wrap.current!;
        const c = camRef.current;
        const sx = el.clientWidth / 2,
          sy = el.clientHeight / 2;
        setCam({ z: 1, x: sx - (sx - c.x) / c.z, y: sy - (sy - c.y) / c.z });
      } else if (e.shiftKey && e.code === "Digit1") {
        e.preventDefault();
        fit();
      } else if (e.shiftKey && e.code === "Digit2") {
        e.preventDefault();
        fit(itemsRef.current.filter((it) => sel.has(it.id)));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (!sel.size) return;
        e.preventDefault();
        commit(itemsRef.current.filter((it) => !sel.has(it.id)));
        setSel(new Set());
      } else if (e.key === "Escape") {
        setSel(new Set());
        setPlaying(null);
        setToolState("select");
      } else if (e.key === "Enter" && sel.size === 1) {
        const it = itemsRef.current.find((x) => sel.has(x.id));
        if (it?.kind === "text") {
          e.preventDefault();
          setEditing({ id: it.id, isNew: false });
        }
      } else if (e.key.startsWith("Arrow") && sel.size) {
        e.preventDefault();
        const n = e.shiftKey ? 5 : 1;
        const dx = e.key === "ArrowLeft" ? -n : e.key === "ArrowRight" ? n : 0,
          dy = e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0;
        commit(itemsRef.current.map((it) => (sel.has(it.id) ? moved(it, dx, dy) : it)));
      } else if (e.altKey && e.code === "KeyZ") {
        e.preventDefault();
        setZen(!zen);
      } else if (k === "q" && !mod) {
        setLocked((l) => !l);
      } else if (!mod && !e.altKey && KEYS[e.code === "Digit0" ? "0" : k]) {
        setTool(KEYS[e.code === "Digit0" ? "0" : k]);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  // ---------- text editing ----------
  const editItem = editing ? items.find((it) => it.id === editing.id) : null;
  const finishText = (value: string) => {
    if (!editing) return;
    const it = itemsRef.current.find((x) => x.id === editing.id);
    setEditing(null);
    if (!it) return;
    if (!value.trim()) commit(itemsRef.current.filter((x) => x.id !== it.id), !editing.isNew);
    else if (value !== it.text) commit(itemsRef.current.map((x) => (x.id === it.id ? { ...x, text: value } : x)), !editing.isNew);
  };

  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeTitle = (t: string) => {
    setTitle(t);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => void save({ id: id as Id<"scratchboards">, title: t }), 600);
  };

  if (board === null)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-[14px]" style={{ background: DESK, color: "#EDEAE3" }}>
        This scratchboard doesn&apos;t exist anymore.
        <Link href="/?view=scratchboards" className="font-medium text-[#F6D36B]">
          Back to Scratchboards
        </Link>
      </div>
    );

  const selected = items.filter((it) => sel.has(it.id));
  const one = selected.length === 1 ? selected[0] : null;
  const showText = tool === "text" || (one?.kind === "text");
  const showFill = !one || ["rect", "diamond", "ellipse", "badge"].includes(one.kind) || (one.kind === "text" && one.style === "big");

  const pencilCursor = playing === null && (tool !== "hand" || red) && !editing;
  const cursor = playing !== null ? "default" : tool === "hand" ? "grab" : pencilCursor ? "none" : "default";
  const chrome = !zen && playing === null;

  return (
    <div className="relative h-dvh w-full overflow-hidden select-none" style={{ background: DESK }}>
      <div ref={wrap} className="absolute inset-0">
        <canvas
          ref={canvas}
          className="block h-full w-full touch-none"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => {
            const r = canvas.current!.getBoundingClientRect();
            pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, down: e.buttons > 0 };
            drawCursor();
            onPointerMove(e);
          }}
          onPointerLeave={() => {
            pointer.current = null;
            drawCursor();
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onWheel={onWheel}
        />
        <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>

      {editItem && <TextEditor item={editItem} cam={cam} onDone={finishText} />}

      {/* Top left: back, title, saved */}
      {chrome && <div className="absolute left-3 top-3 z-10 flex h-10 items-center gap-1 rounded-xl bg-[#33312F]/95 px-1.5 text-[#EDEAE3] shadow-[0_6px_24px_rgba(0,0,0,0.3)]">
        <Link href="/?view=scratchboards" aria-label="Back to Scratchboards" title="Back to Scratchboards" className="flex h-7 w-7 items-center justify-center rounded-md text-[#A9A49A] no-underline hover:bg-white/10 hover:text-[#EDEAE3]">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
        </Link>
        <input
          value={title ?? board?.title ?? ""}
          onChange={(e) => changeTitle(e.target.value)}
          placeholder="Untitled scratchboard"
          aria-label="Title"
          size={Math.min(20, Math.max(10, (title ?? board?.title ?? "").length + 1))}
          className="hidden h-7 min-w-0 rounded-md bg-transparent px-1.5 text-[13px] font-semibold uppercase tracking-[0.04em] outline-none hover:bg-white/10 focus:bg-white/10 xl:block"
          style={{ fontFamily: "Archivo, system-ui, sans-serif" }}
        />
        <span
          title={saving === "saving" ? "Saving…" : saving === "error" ? "Couldn't save" : "Saved"}
          className={`mx-1.5 h-1.5 w-1.5 rounded-full ${saving === "error" ? "bg-[#E24B3F]" : saving === "saving" ? "bg-[#F6D36B]" : "bg-[#7FA752]"}`}
        />
      </div>}

      {/* Top center: tools (Excalidraw's order and shortcuts) */}
      {chrome && <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-[#33312F]/90 p-1 shadow-[0_6px_24px_rgba(0,0,0,0.25)] backdrop-blur">
        <button
          type="button"
          onClick={() => setLocked(!locked)}
          aria-pressed={locked}
          title="Keep selected tool active after drawing (Q)"
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${locked ? "bg-[#F6D36B] text-[#22211f]" : "text-[#A9A49A] hover:bg-white/10 hover:text-[#EDEAE3]"}`}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
            <path d={locked ? "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" : "M5.5 7V5a2.5 2.5 0 0 1 4.8-1"} />
          </svg>
        </button>
        <span className="mx-0.5 h-5 w-px bg-white/10" />
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            onClick={() => setTool(t.tool)}
            aria-pressed={tool === t.tool}
            title={`${t.label} — ${t.key}`}
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${tool === t.tool ? "bg-[#F6D36B] text-[#22211f]" : "text-[#EDEAE3] hover:bg-white/10"}`}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {t.icon}
            </svg>
          </button>
        ))}
        <span className="mx-0.5 h-5 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => {
            setSel(new Set());
            fit();
            setPlaying(performance.now());
          }}
          title="Play: watch the pencil draw the board"
          className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#22211f]"
          style={{ background: "#F6D36B", fontFamily: "Archivo, system-ui, sans-serif" }}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
            <path d="M4 2.5v11l9-5.5z" />
          </svg>
          {playing !== null ? "Stop" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => setPanel(!panel)}
          aria-pressed={panel}
          title="Style: colors, fills, line weight, lettering"
          className={`ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${panel ? "bg-white/15 text-[#F6D36B]" : "text-[#EDEAE3] hover:bg-white/10"}`}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 2a6 6 0 1 0 0 12c.9 0 1.2-.7.9-1.4-.3-.8.2-1.6 1.1-1.6H12a2 2 0 0 0 2-2A6 6 0 0 0 8 2Z" />
            <circle cx="5" cy="7" r=".8" fill="currentColor" />
            <circle cx="8" cy="4.8" r=".8" fill="currentColor" />
            <circle cx="11" cy="7" r=".8" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setZen(true)}
          title="Present: hide everything (Alt+Z)"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#EDEAE3] hover:bg-white/10"
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
          </svg>
        </button>
      </div>}

      {/* Left: style for the selection / next thing (only when opened) */}
      {chrome && panel && (
        <div className="absolute left-3 top-16 z-10 w-[212px] rounded-xl bg-[#33312F]/95 p-3 text-[#EDEAE3] shadow-[0_6px_24px_rgba(0,0,0,0.3)]" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          <Label>Ink</Label>
          <div className="mb-3 grid grid-cols-6 gap-1.5">
            {PALETTE.map((c) => (
              <Swatch key={c.hex} hex={c.hex} name={c.name} on={style.color === c.hex} onClick={() => restyle({ color: c.hex }, () => ({ color: c.hex }))} />
            ))}
          </div>
          {showFill && (
            <>
              <Label>Pencil fill</Label>
              <div className="mb-2 grid grid-cols-6 gap-1.5">
                <button type="button" title="No fill" onClick={() => restyle({ fill: null }, (it) => (it.kind === "badge" || it.kind === "text" ? null : { fill: null }))} className={`h-6 w-6 rounded-full bg-[#FBFAF7] ring-2 ${style.fill === null ? "ring-[#F6D36B]" : "ring-transparent"}`}>
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path d="M6 18 18 6" stroke="#E24B3F" strokeWidth="2" />
                  </svg>
                </button>
                {PALETTE.slice(1).map((c) => (
                  <Swatch key={c.hex} hex={c.hex} name={`${c.name} fill`} hatch on={style.fill === c.hex} onClick={() => restyle({ fill: c.hex }, () => ({ fill: { color: c.hex, tint: style.tint } }))} />
                ))}
              </div>
              <div className="mb-3 flex gap-1">
                {[false, true].map((tint) => (
                  <Pill key={String(tint)} on={style.tint === tint} onClick={() => restyle({ tint }, (it) => (it.fill ? { fill: { ...it.fill, tint } } : null))}>
                    {tint ? "Tint" : "Solid"}
                  </Pill>
                ))}
              </div>
            </>
          )}
          {!showText && (
            <>
              <Label>Line weight</Label>
              <div className="mb-3 flex gap-1">
                {[
                  [2.6, "Bold"],
                  [3.4, "Heavy"],
                  [4.4, "Max"],
                ].map(([w, n]) => (
                  <Pill key={n} on={style.w === w} onClick={() => restyle({ w: w as number }, () => ({ w: w as number }))}>
                    <span className="inline-block rounded-full bg-current align-middle" style={{ width: 18, height: (w as number) * 0.9 }} /> {n}
                  </Pill>
                ))}
              </div>
              <Label>Corners</Label>
              <div className="mb-3 flex gap-1">
                {[true, false].map((r) => (
                  <Pill key={String(r)} on={style.corner === r} onClick={() => restyle({ corner: r }, (it) => (it.kind === "rect" ? { r: r ? 22 : 0 } : null))}>
                    {r ? "Round" : "Sharp"}
                  </Pill>
                ))}
              </div>
            </>
          )}
          <Label>Lettering</Label>
          <div className="mb-2 grid grid-cols-2 gap-1">
            {(Object.keys(TEXT) as TextStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  restyle({ textStyle: s, textSize: null }, (it) => (it.kind === "text" ? { style: s, size: TEXT[s].size } : null));
                  if (!one) setTool("text");
                }}
                className={`h-8 truncate rounded-md px-1.5 text-[13px] ${(one?.kind === "text" ? one.style : style.textStyle) === s ? "bg-[#F6D36B] text-[#22211f]" : "bg-white/5 hover:bg-white/10"}`}
                style={{ fontFamily: TEXT[s].family, fontWeight: TEXT[s].weight, textTransform: TEXT[s].upper ? "uppercase" : "none", fontSize: s === "label" ? 10.5 : s === "note" ? 15 : 12 }}
              >
                {TEXT[s].label}
              </button>
            ))}
          </div>
          {showText && (
            <div className="mb-3 flex gap-1">
              {[
                ["S", 0.6],
                ["M", 1],
                ["L", 1.5],
                ["XL", 2.2],
              ].map(([n, k]) => {
                const st = one?.kind === "text" ? one.style ?? "note" : style.textStyle;
                const size = Math.round(TEXT[st].size * (k as number));
                return (
                  <Pill key={n} on={(one?.kind === "text" ? one.size : style.textSize ?? TEXT[st].size) === size} onClick={() => restyle({ textSize: size }, (it) => (it.kind === "text" ? { size } : null))}>
                    {n}
                  </Pill>
                );
              })}
            </div>
          )}
          <Label>Extras</Label>
          <div className="flex gap-1">
            <Pill
              on={false}
              onClick={() => {
                const el = wrap.current!;
                const [x, y] = toWorld(el.clientWidth / 2, el.clientHeight / 2);
                const n = String(itemsRef.current.filter((it) => it.kind === "badge").length + 1);
                const it: Item = { id: uid(), seed: newSeed(), kind: "badge", cx: x, cy: y, r: 44, text: n, color: INK, fill: { color: style.fill ?? "#4F8DD6" } };
                commit([...itemsRef.current, it]);
                setToolState("select");
                setSel(new Set([it.id]));
              }}
            >
              ③ Badge
            </Pill>
            <Pill
              on={false}
              onClick={() => {
                const el = wrap.current!;
                const [x, y] = toWorld(el.clientWidth / 2, el.clientHeight / 2);
                const it: Item = { id: uid(), seed: newSeed(), kind: "tick", x, y, s: 1.6 };
                commit([...itemsRef.current, it]);
                setToolState("select");
                setSel(new Set([it.id]));
              }}
            >
              ✓ Tick
            </Pill>
            {one && (one.kind === "line" || one.kind === "arrow") && (
              <Pill on={!!one.dashed} onClick={() => commit(itemsRef.current.map((it) => (it.id === one.id ? { ...it, dashed: !it.dashed } : it)))}>
                Dashed
              </Pill>
            )}
          </div>
          {one?.kind === "arrow" && (
            <>
              <div className="mt-3" />
              <Label>Curve</Label>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={one.bend ?? 0.25}
                onChange={(e) => {
                  const bend = Number(e.target.value);
                  itemsRef.current = itemsRef.current.map((it) => (it.id === one.id ? { ...it, bend } : it));
                  setItemsState(itemsRef.current);
                  persist();
                }}
                className="w-full accent-[#F6D36B]"
              />
            </>
          )}
        </div>
      )}

      {/* Bottom left: zoom and undo */}
      {chrome && <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl bg-[#33312F]/95 p-1 text-[#EDEAE3] shadow-[0_6px_24px_rgba(0,0,0,0.3)]" style={{ fontFamily: "JetBrains Mono, monospace" }}>
        <IconBtn title="Zoom out (⌘-)" onClick={() => zoomBy(1 / 1.2)}>−</IconBtn>
        <button type="button" onClick={() => fit()} title="Zoom to fit (⇧1)" className="h-8 min-w-[54px] rounded-md px-1 text-[12px] hover:bg-white/10">
          {Math.round(cam.z * 100)}%
        </button>
        <IconBtn title="Zoom in (⌘+)" onClick={() => zoomBy(1.2)}>+</IconBtn>
        <span className="mx-0.5 h-5 w-px bg-white/10" />
        <IconBtn title="Undo (⌘Z)" onClick={undo}>↶</IconBtn>
        <IconBtn title="Redo (⇧⌘Z)" onClick={redo}>↷</IconBtn>
      </div>}

      {zen && (
        <button
          type="button"
          onClick={() => setZen(false)}
          className="absolute bottom-3 right-3 z-10 rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-[#8E8B84] opacity-0 transition-opacity hover:bg-black/5 hover:opacity-100"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Exit presenting (Alt+Z)
        </button>
      )}

      {!items.length && loaded && !editing && !zen && (
        <div className="pointer-events-none absolute inset-x-0 top-[42%] text-center text-[#8E8B84]" style={{ fontFamily: '"Architects Daughter", cursive', fontSize: 26 }}>
          pick a tool and start drawing
        </div>
      )}
    </div>
  );
}

function TextEditor({ item, cam, onDone }: { item: Item; cam: Cam; onDone: (v: string) => void }) {
  const st = TEXT[item.style ?? "note"];
  const size = (item.size ?? st.size) * cam.z;
  const [value, setValue] = useState(item.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const x = (item.x ?? 0) * cam.z + cam.x;
  // A tall line box so tall letters and tails (g, y, 9) never get clipped; its baseline sits on the item's baseline
  const lineH = size * 1.6;
  const y = (item.y ?? 0) * cam.z + cam.y - size * 1.18;
  const w = textWidth({ ...item, text: value || " " }) * cam.z + size;
  const align = item.align ?? "left";
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, " "))}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
        e.stopPropagation();
      }}
      spellCheck={false}
      className="absolute z-20 resize-none overflow-visible whitespace-pre border-none bg-transparent p-0 outline-none"
      style={{
        left: align === "center" ? x - 400 : align === "right" ? x - 800 : x,
        top: y,
        width: align === "left" ? Math.max(40, w) : 800,
        textAlign: align,
        height: lineH,
        fontFamily: st.family,
        fontWeight: st.weight,
        fontSize: size,
        lineHeight: `${lineH}px`,
        letterSpacing: st.spacing * cam.z,
        textTransform: st.upper ? "uppercase" : "none",
        color: item.style === "big" ? (item.fill?.color ?? "#E2774F") : (item.color ?? INK),
        caretColor: "#E2774F",
      }}
    />
  );
}

const Label = ({ children }: { children: ReactNode }) => <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A9A49A]">{children}</div>;
const Pill = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className={`h-7 flex-1 whitespace-nowrap rounded-md px-1.5 text-[11px] ${on ? "bg-[#F6D36B] text-[#22211f]" : "bg-white/5 hover:bg-white/10"}`}>
    {children}
  </button>
);
const IconBtn = ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} title={title} aria-label={title} className="flex h-8 w-8 items-center justify-center rounded-md text-[15px] hover:bg-white/10">
    {children}
  </button>
);
function Swatch({ hex, name, on, onClick, hatch }: { hex: string; name: string; on: boolean; onClick: () => void; hatch?: boolean }) {
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      onClick={onClick}
      className={`h-6 w-6 rounded-full ring-2 transition-transform hover:scale-110 ${on ? "ring-[#F6D36B]" : "ring-transparent"}`}
      style={{ background: hatch ? `repeating-linear-gradient(-35deg, ${hex} 0 4px, ${hex}88 4px 6px)` : hex }}
    />
  );
}

export { shownText };
