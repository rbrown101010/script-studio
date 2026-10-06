"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { nnGradientColor, nnGradientSolidData, nnReadGradient, type BoardGradient } from "@/lib/boardGradient";

export type GradientSelection = { ids: string; gradient: BoardGradient | null; mixed: boolean; start: string };

export function gradientSelection(elements: readonly ExcalidrawElement[], selected: Record<string, boolean>): GradientSelection | null {
  const rectangles = elements.filter((e) => selected[e.id] && !e.isDeleted && e.type === "rectangle" && !e.customData?.blur);
  if (!rectangles.length) return null;
  const first = rectangles[0];
  const gradient = nnReadGradient(first);
  const mixed = rectangles.some((e) => JSON.stringify(nnReadGradient(e)) !== JSON.stringify(gradient));
  return { ids: rectangles.map((e) => e.id).join(","), gradient, mixed, start: nnGradientColor(first.backgroundColor) ? first.backgroundColor : "#a5d8ff" };
}

/** One native history entry, preserving unrelated customData and all non-rectangle shapes. */
export async function setGradient(api: ExcalidrawImperativeAPI | null, gradient: BoardGradient | null) {
  if (!api) return;
  const { newElementWith, CaptureUpdateAction } = await import("@excalidraw/excalidraw");
  const selected = api.getAppState().selectedElementIds;
  const elements = api.getSceneElementsIncludingDeleted().map((e) => {
    if (!selected[e.id] || e.isDeleted || e.type !== "rectangle" || e.customData?.blur) return e;
    if (!gradient) return newElementWith(e, nnGradientSolidData(e));
    return newElementWith(e, {
      customData: { ...e.customData, backgroundGradient: gradient },
      backgroundColor: gradient.start, // Sensible solid fallback in unmodified Excalidraw clients.
      fillStyle: "solid",
    });
  });
  api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}

/** Keep the fill controls in the existing Background section on desktop and in the phone Style panel. */
export function GradientControls({ root, selection, onChange }: {
  root: React.RefObject<HTMLElement | null>;
  selection: GradientSelection | null;
  onChange: (gradient: BoardGradient | null) => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const slot = document.createElement("div");
    slot.className = "nn-gradient-controls";
    const sync = () => {
      const background = container.querySelector('[data-nn-color-picker="elementBackground"]');
      if (background && slot.parentNode !== background) background.appendChild(slot);
    };
    sync();
    setHost(slot);
    const observer = new MutationObserver(sync);
    observer.observe(container, { childList: true, subtree: true });
    return () => { observer.disconnect(); slot.remove(); };
  }, [root]);
  if (!host || !selection) return null;
  const gradient = selection.gradient ?? { type: "linear", start: selection.start, end: "#b197fc", angle: 0 };
  const on = !!selection.gradient && !selection.mixed;
  return createPortal(
    <div onKeyDown={(e) => e.stopPropagation()}>
      <div className="buttonList nn-gradient-modes" role="group" aria-label="Background fill">
        <button type="button" className={!selection.gradient && !selection.mixed ? "active" : ""} aria-pressed={!selection.gradient && !selection.mixed}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(null)}>Solid</button>
        <button type="button" className={on ? "active" : ""} aria-pressed={on}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(gradient)}>
          <span className="nn-gradient-swatch" aria-hidden="true" />Gradient
        </button>
      </div>
      {selection.mixed && <p className="nn-gradient-hint">Mixed fills</p>}
      {(selection.gradient || selection.mixed) && <div className="nn-gradient-fields">
        <GradientColor key={`${selection.ids}-start`} label="Start color" value={gradient.start} onChange={(start) => onChange({ ...gradient, start })} />
        <GradientColor key={`${selection.ids}-end`} label="End color" value={gradient.end} onChange={(end) => onChange({ ...gradient, end })} />
        <label className="nn-gradient-direction">Direction
          <select aria-label="Gradient direction" value={gradient.angle} onChange={(e) => onChange({ ...gradient, angle: Number(e.target.value) })}>
            {![0, 45, 90, 135, 180, 225, 270, 315].includes(gradient.angle) && <option value={gradient.angle}>{gradient.angle}°</option>}
            <option value={0}>→ Left to right</option><option value={90}>↓ Top to bottom</option>
            <option value={45}>↘ Diagonal down</option><option value={135}>↙ Diagonal left</option>
            <option value={180}>← Right to left</option><option value={270}>↑ Bottom to top</option>
            <option value={225}>↖ Diagonal up</option><option value={315}>↗ Diagonal right</option>
          </select>
        </label>
      </div>}
    </div>, host,
  );
}

function GradientColor({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = !nnGradientColor(draft);
  const commit = () => {
    if (!invalid && draft !== value) onChange(draft.toLowerCase());
  };
  return <label className="nn-gradient-color">
    <span>{label}</span>
    <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    <input type="text" aria-label={`${label} hex`} value={draft} aria-invalid={invalid} maxLength={7} spellCheck={false}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); setDraft(value); }
      }} />
  </label>;
}
