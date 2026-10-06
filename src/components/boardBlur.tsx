"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Blur rectangles: a rectangle with the Blur effect (Effects in its style panel) frosts whatever is under it,
 * so things can be hidden on a board until it's time to talk about them. The rectangle itself is drawn
 * invisible (no stroke, an almost clear fill so it can still be grabbed from inside) and the frosting is a
 * backdrop blur laid over Excalidraw's canvas. Blurs always sit above everything else. The flag lives in
 * customData, which Excalidraw keeps through copy, paste, duplicate, undo and the multi-tab merge.
 */

type Roundness = { type: number; value?: number } | null;
export type BlurEl = {
  id: string;
  type: string;
  version: number;
  isDeleted?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  opacity: number;
  roundness?: Roundness;
  containerId?: string | null;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  customData?: Record<string, unknown>;
};

/** Almost clear, but not "transparent", so Excalidraw still lets you grab the rectangle from inside */
const CLEAR_FILL = "#ffffff01";
/** Blur strength at 100% zoom, in px (CSS blur radius = SVG stdDeviation) */
const STRENGTH = 14;

export const isBlur = (e: { type: string; customData?: Record<string, unknown> }) => e.type === "rectangle" && !!e.customData?.blur;

/** The corner radius Excalidraw draws a rounded rectangle with */
function cornerRadius(e: BlurEl) {
  if (!e.roundness) return 0;
  const side = Math.min(Math.abs(e.width), Math.abs(e.height));
  if (e.roundness.type === 3) {
    const fixed = e.roundness.value ?? 32;
    return side <= fixed / 0.25 ? side * 0.25 : fixed;
  }
  return side * 0.25;
}

/** The scene with blurs (and their labels) moved to the top, or null when they already are */
export function blursOnTop<T extends BlurEl>(els: readonly T[]): T[] | null {
  const ids = new Set(els.filter((e) => !e.isDeleted && isBlur(e)).map((e) => e.id));
  if (!ids.size) return null;
  const moving = (e: T) => ids.has(e.id) || (!!e.containerId && ids.has(e.containerId));
  let seen = false;
  let inOrder = true;
  for (const e of els) {
    if (e.isDeleted) continue;
    if (moving(e)) seen = true;
    else if (seen) {
      inOrder = false;
      break;
    }
  }
  return inOrder ? null : [...els.filter((e) => !moving(e)), ...els.filter(moving)];
}

/** Turns Blur on or off for the selected rectangles (one undo step) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setBlur(api: any, on: boolean) {
  if (!api) return;
  const { newElementWith, CaptureUpdateAction } = await import("@excalidraw/excalidraw");
  const picked = api.getAppState().selectedElementIds ?? {};
  const all = api.getSceneElementsIncludingDeleted() as BlurEl[];
  const next = all.map((e) => {
    if (!picked[e.id] || e.isDeleted || e.type !== "rectangle" || isBlur(e) === on) return e;
    if (on) {
      const was = { strokeColor: e.strokeColor, backgroundColor: e.backgroundColor, fillStyle: e.fillStyle };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return newElementWith(e as any, { customData: { ...e.customData, blur: true, blurWas: was }, strokeColor: "transparent", backgroundColor: CLEAR_FILL, fillStyle: "solid" } as any);
    }
    const { blur: _b, blurWas, ...rest } = e.customData ?? {};
    const was = (blurWas as Partial<BlurEl> | undefined) ?? { strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return newElementWith(e as any, { customData: rest, ...was } as any);
  }) as BlurEl[];
  api.updateScene({ elements: blursOnTop(next) ?? next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}

/** One frosted box, in screen pixels relative to the canvas */
export type BlurBox = { id: string; left: number; top: number; width: number; height: number; angle: number; radius: number; opacity: number };
export type BlurView = { boxes: BlurBox[]; width: number; height: number; zoom: number };

/** Where the blurs are on screen right now */
export function blurView(elements: readonly BlurEl[], appState: Record<string, unknown>): BlurView {
  const zoom = (appState.zoom as { value: number })?.value ?? 1;
  const sx = (appState.scrollX as number) ?? 0;
  const sy = (appState.scrollY as number) ?? 0;
  const r = (n: number) => Math.round(n * 2) / 2;
  const boxes = elements
    .filter((e) => !e.isDeleted && isBlur(e))
    .map((e) => ({
      id: e.id,
      left: r((e.x + sx) * zoom),
      top: r((e.y + sy) * zoom),
      width: r(e.width * zoom),
      height: r(e.height * zoom),
      angle: e.angle,
      radius: r(cornerRadius(e) * zoom),
      opacity: e.opacity / 100,
    }));
  return { boxes, width: (appState.width as number) ?? 0, height: (appState.height as number) ?? 0, zoom };
}

/** A div kept inside Excalidraw's own DOM wherever `place` puts it (Excalidraw remounts its panels often) */
function useSlot(root: React.RefObject<HTMLElement | null>, place: (root: HTMLElement, host: HTMLElement) => void) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    const el = document.createElement("div");
    el.style.display = "contents";
    const sync = () => place(r, el);
    sync();
    setHost(el);
    const mo = new MutationObserver(sync);
    mo.observe(r, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      el.remove();
    };
  }, [root, place]);
  return host;
}

/** Just above the drawing and below Excalidraw's selection handles (the canvas wrapper only holds the drawing canvas) */
const placeLayer = (root: HTMLElement, host: HTMLElement) => {
  const wrap = root.querySelector(".excalidraw__canvas-wrapper");
  if (wrap && host.parentNode !== wrap) wrap.appendChild(host);
};

/** In the selected shape's style panel, just above Layers */
const placeToggle = (root: HTMLElement, host: HTMLElement) => {
  const col = root.querySelector(".panelColumn");
  if (!col) return;
  const layers = col.querySelector(".zIndexButton")?.closest("fieldset") ?? null;
  const anchor = layers?.parentNode === col ? layers : null;
  if (host.parentNode !== col || (anchor && host.nextSibling !== anchor)) col.insertBefore(host, anchor);
};

/** The frosted boxes over the canvas */
export function BlurLayer({ root, view, dark }: { root: React.RefObject<HTMLElement | null>; view: BlurView; dark: boolean }) {
  const host = useSlot(root, placeLayer);
  if (!host || !view.boxes.length) return null;
  const blur = Math.min(48, Math.max(5, STRENGTH * view.zoom));
  return createPortal(
    <div
      aria-hidden="true"
      style={{ position: "absolute", left: 0, top: 0, width: view.width, height: view.height, overflow: "hidden", pointerEvents: "none", zIndex: "var(--zIndex-canvas)" as unknown as number }}
    >
      {view.boxes.map((b) => (
        <div
          key={b.id}
          style={{
            position: "absolute",
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
            transform: b.angle ? `rotate(${b.angle}rad)` : undefined,
            borderRadius: b.radius,
            opacity: b.opacity,
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
            background: dark ? "rgba(24,24,24,0.32)" : "rgba(255,255,255,0.38)",
          }}
        />
      ))}
    </div>,
    host,
  );
}

/** Effects > Blur, in the style panel when rectangles are selected */
export function BlurToggle({ root, on, onToggle }: { root: React.RefObject<HTMLElement | null>; on: boolean; onToggle: () => void }) {
  const host = useSlot(root, placeToggle);
  if (!host) return null;
  return createPortal(
    <fieldset>
      <legend>Effects</legend>
      <div className="buttonList">
        <button
          type="button"
          className={on ? "active" : ""}
          aria-pressed={on}
          title={on ? "Blur is on: frosts whatever is under it, always on top" : "Blur: frost whatever is under this rectangle"}
          // Keep keyboard focus on the canvas so shortcuts (duplicate, undo…) keep working: this button is portaled
          // into Excalidraw's panel, so its key presses don't reach Excalidraw's own handler
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onToggle();
            root.current?.querySelector<HTMLElement>(".excalidraw-container")?.focus();
          }}
          style={{ width: "auto", padding: "0 10px", gap: 6, fontSize: 12 }}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={{ width: 16, height: 16 }}>
            <rect x="3" y="3" width="14" height="14" rx="3" />
            <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="12.5" cy="7.5" r="1" fill="currentColor" stroke="none" opacity="0.7" />
            <circle cx="7.5" cy="12.5" r="1" fill="currentColor" stroke="none" opacity="0.7" />
            <circle cx="12.5" cy="12.5" r="0.7" fill="currentColor" stroke="none" opacity="0.45" />
          </svg>
          Blur
        </button>
      </div>
    </fieldset>,
    host,
  );
}

/**
 * Board previews (SVG exports): blurs are swapped for solid marker rectangles before export, then each marker
 * becomes a blurred copy of the drawing clipped to its shape.
 */
export function markBlurs<T extends { type: string; customData?: Record<string, unknown> }>(elements: T[]) {
  const markers = new Map<string, number>();
  const out = elements.map((e) => {
    if (!isBlur(e)) return e;
    const color = `#0b${markers.size.toString(16).padStart(4, "0")}`;
    markers.set(color, ((e as unknown as BlurEl).opacity ?? 100) / 100);
    return { ...e, strokeColor: "transparent", backgroundColor: color, fillStyle: "solid", roughness: 0, opacity: 100 };
  });
  return { elements: out, markers };
}

export function applyBlurs(svg: SVGSVGElement, markers: Map<string, number>, background: string) {
  if (!markers.size) return;
  const NS = "http://www.w3.org/2000/svg";
  const make = (tag: string, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const pre = `nnblur${Math.random().toString(36).slice(2, 8)}`;
  const vb = svg.getAttribute("viewBox")?.split(/[\s,]+/).map(Number) ?? [0, 0, 0, 0];
  const [w, h] = [vb[2] || 1, vb[3] || 1];
  let defs = svg.querySelector(":scope > defs");
  if (!defs) defs = svg.insertBefore(make("defs", {}), svg.firstChild);
  const found: { top: Element; d: string; transform: string; opacity: number }[] = [];
  for (const [color, opacity] of markers) {
    const path = svg.querySelector(`path[fill="${color}"]`);
    if (!path) continue;
    const transforms: string[] = [];
    let top: Element = path;
    for (let n: Element | null = path; n && n !== svg; n = n.parentElement) {
      const t = n.getAttribute("transform");
      if (t) transforms.unshift(t);
      top = n;
    }
    found.push({ top, d: path.getAttribute("d") ?? "", transform: transforms.join(" "), opacity });
  }
  if (!found.length) return;
  for (const f of found) f.top.remove();
  // Everything else drawn, as one group the blurs can show a blurred copy of
  const content = make("g", { id: `${pre}c` });
  for (const child of [...svg.childNodes]) {
    if (child === defs || (child as Element).tagName === "metadata") continue;
    content.appendChild(child);
  }
  svg.appendChild(content);
  const filter = make("filter", { id: `${pre}f`, filterUnits: "userSpaceOnUse", x: 0, y: 0, width: w, height: h });
  filter.appendChild(make("feGaussianBlur", { stdDeviation: STRENGTH }));
  defs.appendChild(filter);
  found.forEach((f, i) => {
    const clip = make("clipPath", { id: `${pre}k${i}` });
    clip.appendChild(make("path", { d: f.d, transform: f.transform }));
    defs.appendChild(clip);
    const g = make("g", { "clip-path": `url(#${pre}k${i})`, opacity: f.opacity });
    g.appendChild(make("rect", { x: 0, y: 0, width: w, height: h, fill: background }));
    g.appendChild(make("use", { href: `#${pre}c`, filter: `url(#${pre}f)` }));
    g.appendChild(make("rect", { x: 0, y: 0, width: w, height: h, fill: "#ffffff", "fill-opacity": 0.38 }));
    svg.appendChild(g);
  });
}
