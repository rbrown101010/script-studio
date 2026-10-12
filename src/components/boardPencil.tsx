"use client";

// Pencil mode for boards: Riley's "drawing board" short-form style (pencil on warm white paper, thick ink
// lines, colored-pencil hatching, Archivo-style headings and handwritten notes). It's a per-board toggle:
// switching it on changes the page and what you draw next; nothing already on the board is touched.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const PAPER = "#FBFAF7";
export const INK = "#2B2B2C";

/** The style's palette (colors as they read in pencil on the paper) */
export const PENCIL_COLORS: { name: string; hex: string }[] = [
  { name: "Ink", hex: INK },
  { name: "Coral", hex: "#E2774F" },
  { name: "Blue", hex: "#4F8DD6" },
  { name: "Violet", hex: "#9B6FC9" },
  { name: "Pink", hex: "#C96FA6" },
  { name: "Tan", hex: "#C28F55" },
  { name: "Green", hex: "#7FA752" },
  { name: "Red", hex: "#E24B3F" },
  { name: "Graphite", hex: "#8E8B84" },
];
const HIGHLIGHT = "#F6D36B";

// Excalidraw's own fonts closest to the style: Lilita One ≈ heavy Archivo headings, Excalifont ≈ the
// handwritten notes, Cascadia ≈ the mono labels
const FONT = { heading: 7, note: 5, label: 3 } as const;

/** The open board's Excalidraw API (set by the board when it mounts) */
let API: any = null;
export const registerPencilApi = (api: any) => {
  API = api;
};

/** What you draw next in pencil mode: thick confident ink, clean single lines, hatched color, curved arrows */
const ON = {
  viewBackgroundColor: PAPER,
  currentItemStrokeColor: INK,
  currentItemBackgroundColor: "transparent",
  currentItemStrokeWidth: 4,
  currentItemRoughness: 0,
  currentItemFillStyle: "hachure",
  currentItemOpacity: 100,
  currentItemFontFamily: FONT.note,
  currentItemFontSize: 28,
  currentItemRoundness: "round",
  currentItemArrowType: "round",
  currentItemEndArrowhead: "arrow",
};
/** Excalidraw's usual defaults, for switching back */
const OFF = {
  viewBackgroundColor: "#ffffff",
  currentItemStrokeColor: "#1e1e1e",
  currentItemBackgroundColor: "transparent",
  currentItemStrokeWidth: 2,
  currentItemRoughness: 1,
  currentItemFillStyle: "solid",
  currentItemFontFamily: 5,
  currentItemFontSize: 20,
  currentItemArrowType: "round",
};

export function applyPencil(on: boolean) {
  API?.updateScene({ appState: on ? ON : OFF });
}

const bump = (e: any, patch: Record<string, unknown>) => ({ ...e, ...patch, version: (e.version ?? 1) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() });

/** Color the selected things (if any) and whatever comes next */
function setColor(api: any, kind: "stroke" | "fill", hex: string | null) {
  if (!api) return;
  const st = api.getAppState();
  const sel = st.selectedElementIds ?? {};
  const els = api.getSceneElementsIncludingDeleted();
  const patch = kind === "stroke" ? { strokeColor: hex ?? INK } : hex ? { backgroundColor: hex, fillStyle: hex === HIGHLIGHT ? "solid" : "hachure" } : { backgroundColor: "transparent" };
  const touched = els.some((e: any) => sel[e.id] && !e.isDeleted);
  api.updateScene({
    ...(touched ? { elements: els.map((e: any) => (sel[e.id] && !e.isDeleted ? bump(e, patch) : e)) } : {}),
    appState:
      kind === "stroke"
        ? { currentItemStrokeColor: hex ?? INK }
        : { currentItemBackgroundColor: hex ?? "transparent", currentItemFillStyle: hex === HIGHLIGHT ? "solid" : "hachure" },
  });
}

/** Pick a lettering style and start typing in it */
function textStyle(api: any, kind: keyof typeof FONT) {
  if (!api) return;
  const size = kind === "heading" ? 48 : kind === "note" ? 28 : 18;
  const color = kind === "label" ? "#5B8FC7" : INK;
  api.updateScene({ appState: { currentItemFontFamily: FONT[kind], currentItemFontSize: size, currentItemStrokeColor: color } });
  api.setActiveTool({ type: "text" });
}

/** The paper: warm grain and a soft vignette over the canvas (it never catches clicks) */
export function PencilPaper() {
  const noise = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
  )}")`;
  return (
    <>
      {/* fine paper grain: speckles, very light */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[3]" style={{ backgroundImage: noise, mixBlendMode: "multiply", opacity: 0.09 }} />
      {/* the warm edge of the sheet */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[3]"
        style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(140,105,65,0.05) 100%)" }}
      />
    </>
  );
}

/** Quick picks for the style: ink and fill colors from the palette, and the three lettering styles */
const getApi = () => API;

export function PencilTray() {
  const dot = "h-[22px] w-[22px] shrink-0 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110";
  return (
    <div className="pointer-events-auto absolute bottom-[68px] left-1/2 z-[4] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-xl bg-white/95 px-2.5 py-1.5 shadow-[0_6px_24px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur [scrollbar-width:none] sm:bottom-4">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8E8B84]">Ink</span>
      {PENCIL_COLORS.map((c) => (
        <button key={c.hex} type="button" title={`${c.name} ink`} aria-label={`${c.name} ink`} onClick={() => setColor(getApi(), "stroke", c.hex)} className={dot} style={{ background: c.hex }} />
      ))}
      <span className="mx-0.5 h-5 w-px shrink-0 bg-black/10" />
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8E8B84]">Fill</span>
      <button type="button" title="No fill" aria-label="No fill" onClick={() => setColor(getApi(), "fill", null)} className={`${dot} bg-white`}>
        <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
          <path d="M5 17 17 5" stroke="#E24B3F" strokeWidth="1.6" />
        </svg>
      </button>
      {PENCIL_COLORS.slice(1).map((c) => (
        <button
          key={c.hex}
          type="button"
          title={`${c.name} pencil fill`}
          aria-label={`${c.name} pencil fill`}
          onClick={() => setColor(getApi(), "fill", c.hex)}
          className={dot}
          style={{ background: `repeating-linear-gradient(-35deg, ${c.hex} 0 3px, transparent 3px 5px)` }}
        />
      ))}
      <button type="button" title="Highlighter" aria-label="Highlighter fill" onClick={() => setColor(getApi(), "fill", HIGHLIGHT)} className={dot} style={{ background: HIGHLIGHT }} />
      <span className="mx-0.5 h-5 w-px shrink-0 bg-black/10" />
      <button type="button" onClick={() => textStyle(getApi(), "heading")} title="Bold heading" className="h-7 shrink-0 rounded-md px-2 text-[14px] uppercase tracking-[0.02em] text-[#2B2B2C] hover:bg-black/5" style={{ fontFamily: "'Lilita One', 'Archivo Black', sans-serif" }}>
        Heading
      </button>
      <button type="button" onClick={() => textStyle(getApi(), "note")} title="Handwritten note" className="h-7 shrink-0 rounded-md px-2 text-[15px] text-[#2B2B2C] hover:bg-black/5" style={{ fontFamily: "Excalifont, 'Architects Daughter', cursive" }}>
        Note
      </button>
      <button type="button" onClick={() => textStyle(getApi(), "label")} title="Small label" className="h-7 shrink-0 rounded-md px-2 font-mono text-[11.5px] uppercase tracking-[0.06em] text-[#5B8FC7] hover:bg-black/5">
        Label
      </button>
    </div>
  );
}

/** A pencil: the mode's toggle icon */
export function PencilIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 2.5 13.5 5 6 12.5 2.5 13.5 3.5 10 11 2.5Z" />
      <path d="m9.5 4 2.5 2.5" />
    </svg>
  );
}
