"use client";

import { useMutation, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../convex/_generated/api";
import { PICK_FRAME, boardIdFrom, boardRef, frameIdFrom, useBoardData, useCanEditBoards, useIsDark } from "@/lib/boardSource";
import type { Block } from "@/lib/types";
import { IconBoard, IconPlus, IconRefresh, IconSearch } from "./icons";
import { applyBlurs, markBlurs } from "./boardBlur";

// The editor (and Excalidraw's styles) only load when a board is opened
const BoardEditor = dynamic(async () => (await import("./BoardEditor")).BoardEditor, {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-(--c-b-ffffff) text-[13px] text-(--c-t-9a9a9a)">Opening board…</div>,
});

type Scene = { title: string; elements: string; appState: string; files: { id: string; url: string; mimeType: string }[]; updatedAt: number };

const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/**
 * The drawing itself, as crisp SVG at its natural size (never blown up), shrunk to fit the width and
 * `maxHeight`. Redraws whenever the board changes, so edits (anyone's) show up live.
 */
type Shape = { id: string; type: string; isDeleted?: boolean; frameId?: string | null; containerId?: string | null; name?: string | null };

/** The frame and everything inside it (with the labels of the things inside) */
export function frameParts(all: Shape[], frameId: string) {
  const frame = all.find((e) => e.id === frameId && !e.isDeleted && (e.type === "frame" || e.type === "magicframe"));
  if (!frame) return null;
  const inside = new Set(all.filter((e) => !e.isDeleted && e.frameId === frameId).map((e) => e.id));
  const parts = all.filter((e) => !e.isDeleted && (e.id === frameId || inside.has(e.id) || (e.containerId && inside.has(e.containerId))));
  return { frame, parts };
}

export function BoardDrawing({ scene, maxHeight, dark, frameId }: { scene: Scene; maxHeight: number; dark: boolean; frameId?: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    void (async () => {
      const all = (JSON.parse(scene.elements || "[]") as Shape[]).filter((e) => !e.isDeleted);
      // Just one frame: only what's inside it, cropped to the frame
      const one = frameId ? frameParts(all, frameId) : null;
      const elements = frameId ? (one?.parts ?? []) : all;
      if (!elements.length) {
        setEmpty(frameId ? (one ? "Empty frame" : "This frame was removed from the board") : "Empty board");
        box.current?.replaceChildren();
        return;
      }
      const { exportToSvg } = await import("@excalidraw/excalidraw");
      const appState = JSON.parse(scene.appState || "{}");
      // Blur rectangles: exported as markers, then turned into frosted patches
      const marked = markBlurs(elements as (Shape & { customData?: Record<string, unknown> })[]);
      const svg = await exportToSvg({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements: marked.elements as any,
        appState: { ...appState, exportBackground: false, exportWithDarkMode: dark, exportEmbedScene: false },
        files: Object.fromEntries(scene.files.map((f) => [f.id, { id: f.id, dataURL: f.url, mimeType: f.mimeType, created: 0 }])) as never,
        exportPadding: frameId ? 0 : 12,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(one ? { exportingFrame: one.frame as any } : {}),
      });
      if (dead || !box.current) return;
      applyBlurs(svg, marked.markers, appState.viewBackgroundColor || "#ffffff");
      const w = parseFloat(svg.getAttribute("width") ?? "0") || 1;
      const h = parseFloat(svg.getAttribute("height") ?? "0") || 1;
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      // Natural size, but no wider than the page and no taller than maxHeight
      svg.style.cssText = `display:block;margin:0 auto;height:auto;aspect-ratio:${w}/${h};width:min(100%, ${w}px, ${(maxHeight * w) / h}px)`;
      setEmpty(null);
      box.current.replaceChildren(svg);
    })();
    return () => {
      dead = true;
    };
  }, [scene.elements, scene.appState, scene.files, dark, maxHeight, frameId]);
  return (
    <>
      <div ref={box} />
      {empty && <div className="flex h-[120px] items-center justify-center text-[13px] text-(--c-t-9a9a9a)">{empty}</div>}
    </>
  );
}

/** Full-screen board on top of everything (the script, or presentation mode). Done / Esc closes it. */
export function BoardOverlay({ id, readOnly, onClose }: { id: string; readOnly?: boolean; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return createPortal(
    <div
      data-board-overlay
      role="dialog"
      aria-modal="true"
      aria-label="Board"
      className="fixed inset-0 z-[100] bg-black/30 p-0 backdrop-blur-[2px] animate-[board-fade_160ms_ease-out] sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="h-full overflow-hidden bg-(--c-b-ffffff) shadow-[0_24px_80px_rgba(0,0,0,0.25)] animate-[board-in_260ms_cubic-bezier(0.2,0,0,1)] sm:rounded-2xl">
        <BoardEditor id={boardIdFrom(id)} focus={frameIdFrom(id)} readOnly={readOnly} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}

/**
 * A board in a script: the live drawing in a soft frame with its title underneath. Click to open it
 * full screen and draw, then Done (or Esc) drops you back on the line. A new board block starts as a
 * picker: search the team's boards, or start a new one.
 */
export function BoardBlock({
  block,
  readOnly,
  register,
  onKey,
  onFocus,
  onPick,
  onCancel,
  newBoardName,
}: {
  block: Block;
  readOnly: boolean;
  register: (el: HTMLDivElement | null) => void;
  onKey: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  /** Sets which board this block shows */
  onPick: (id: string) => void;
  /** Name for a board made here when nothing is typed (the script's title, then "Title 2"…) */
  newBoardName?: string;
  /** Leaves the picker without choosing (turns the line back into text) */
  onCancel: () => void;
}) {
  const canEdit = useCanEditBoards() && !readOnly;
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);

  const waitingForFrame = block.content === PICK_FRAME;
  if (!block.content || waitingForFrame || changing) {
    if (!canEdit) return null;
    return (
      <BoardPicker
        register={register}
        current={waitingForFrame ? null : boardIdFrom(block.content) || null}
        // From the / menu's "Excalidraw frame", or changing a frame block: go on to pick a frame
        framesOnly={waitingForFrame || (changing && !!frameIdFrom(block.content))}
        newBoardName={newBoardName}
        onPick={(id, fresh) => {
          setChanging(false);
          onPick(id);
          if (fresh) setOpen(true);
        }}
        onCancel={() => (changing ? setChanging(false) : onCancel())}
      />
    );
  }

  return (
    <div
      ref={register}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={readOnly ? undefined : onKey}
      onFocus={readOnly ? undefined : onFocus}
      aria-label="Board"
      className="min-w-0 flex-1 rounded-xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-(--c-l-2358d8)"
    >
      <BoardCard id={block.content} onOpen={() => setOpen(true)} onChange={canEdit ? () => setChanging(true) : undefined} />
      {open && <BoardOverlay id={block.content} readOnly={!canEdit} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The framed drawing plus its title row. Also used by diffs and presentation mode. */
export function BoardCard({
  id,
  onOpen,
  onChange,
  maxHeight = 360,
  forceDark,
}: {
  id: string;
  onOpen: () => void;
  onChange?: () => void;
  maxHeight?: number;
  forceDark?: boolean;
}) {
  const scene = useBoardData(id);
  const themeDark = useIsDark();
  const dark = forceDark ?? themeDark;
  const frameId = frameIdFrom(id);
  const frameName = useMemo(() => {
    if (!frameId || !scene) return null;
    const f = (JSON.parse(scene.elements || "[]") as Shape[]).find((e) => e.id === frameId && !e.isDeleted);
    return f ? f.name?.trim() || "Frame" : null;
  }, [frameId, scene]);

  if (scene === undefined) return <div className="h-[180px] animate-pulse rounded-xl bg-(--c-b-f4f4f4)" />;
  if (scene === null)
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-(--c-l-dcdcdc) px-4 py-3 text-[13px] text-(--c-t-8a8a8a)">
        <IconBoard size={15} />
        <span className="flex-1">This board was deleted or isn&apos;t shared here.</span>
        {onChange && (
          <button type="button" onClick={onChange} className="font-medium text-(--c-t-2358d8)">
            Choose another
          </button>
        )}
      </div>
    );

  return (
    <div className="group/board">
      <button
        type="button"
        onClick={onOpen}
        title="Open board"
        className={`relative block w-full cursor-zoom-in overflow-hidden rounded-xl px-3 py-3 text-left ring-1 transition-[box-shadow,background-color] duration-200 ${
          forceDark ? "bg-white/[0.03] ring-white/10 hover:ring-white/25" : "bg-(--c-b-fafaf9) ring-(--c-l-ebebeb) hover:ring-(--c-l-dcdcdc) hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)]"
        }`}
      >
        <BoardDrawing scene={scene} maxHeight={maxHeight} dark={dark} frameId={frameId} />
        <span
          className={`pointer-events-none absolute right-2.5 top-2.5 rounded-full px-2.5 py-1 text-[12px] font-medium opacity-0 shadow-sm transition-opacity duration-150 group-hover/board:opacity-100 ${
            forceDark ? "bg-white text-black" : "bg-(--c-b-1b1b1b) text-(--c-on-ink)"
          }`}
        >
          {onChange ? (frameId ? "Edit frame" : "Edit board") : "Open"}
        </span>
      </button>
      <div className={`mt-1.5 flex h-6 items-center gap-1.5 px-1 text-[12.5px] ${forceDark ? "text-[#9a9a9a]" : "text-(--c-t-8a8a8a)"}`}>
        {frameId ? <FrameGlyph /> : <IconBoard size={13} />}
        {frameId && <span className={`truncate font-medium ${forceDark ? "text-[#cfcfcf]" : "text-(--c-t-4a4a4a)"}`}>{frameName ?? "Frame"}</span>}
        {frameId && <span className="shrink-0">in</span>}
        <span className={`truncate ${frameId ? "" : "font-medium"} ${forceDark ? "text-[#cfcfcf]" : "text-(--c-t-4a4a4a)"}`}>{scene.title}</span>
        <span className="shrink-0">· {ago(scene.updatedAt)}</span>
        {onChange && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onChange}
            className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 opacity-0 transition-opacity hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b) group-hover/board:opacity-100 group-focus-within/board:opacity-100 pointer-coarse:opacity-100"
          >
            <IconRefresh size={12} />
            {frameId ? "Change frame" : "Change board"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Search the team's boards (titles and what's drawn on them), or start a new one. Keyboard friendly. */
function BoardPicker({
  register,
  current,
  framesOnly,
  newBoardName,
  onPick,
  onCancel,
}: {
  register: (el: HTMLDivElement | null) => void;
  current: string | null;
  framesOnly?: boolean;
  newBoardName?: string;
  /** ref = the board id, or "<board>#frame=<frame>" for one frame */
  onPick: (ref: string, fresh: boolean) => void;
  onCancel: () => void;
}) {
  const boards = useQuery(api.boards.list);
  const create = useMutation(api.boards.create);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const matches = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (boards ?? []).filter((b) => b.id !== current && terms.every((t) => `${b.title}\n${b.summary}`.toLowerCase().includes(t))).slice(0, 7);
  }, [boards, q, current]);
  // Row 0 is "New board"; boards follow
  const count = matches.length + 1;

  const makeNew = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onPick(await create({ title: q.trim() || newBoardName?.trim() || undefined }), true);
    } finally {
      setBusy(false);
    }
  };
  /** A board picked from the list: next, choose the whole board or one of its frames (when it has any) */
  const [chosen, setChosen] = useState<string | null>(null);
  const choose = (i: number) => (i === 0 ? void makeNew() : setChosen(matches[i - 1].id));

  if (chosen)
    return (
      <div ref={register} className="min-w-0 flex-1 py-1">
        <FrameStep boardId={chosen} framesOnly={!!framesOnly} onPick={(ref) => onPick(ref, false)} onBack={() => setChosen(null)} />
      </div>
    );

  return (
    <div ref={register} className="min-w-0 flex-1 py-1">
      <div className="overflow-hidden rounded-xl bg-(--c-b-ffffff) shadow-[0_0_0_1px_var(--c-l-e3e3e0),0_8px_28px_rgba(0,0,0,0.07)] animate-[board-pop_220ms_cubic-bezier(0.2,0,0,1)_both]">
        <div className="flex h-11 items-center gap-2 border-b border-(--c-l-ebebeb) px-3 text-(--c-t-9a9a9a)">
          <IconSearch size={15} />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + count) % count);
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(active);
              } else if (e.key === "Escape" || (e.key === "Backspace" && !q)) {
                e.preventDefault();
                onCancel();
              }
            }}
            placeholder={current ? "Switch to another board…" : "Find a board, or name a new one…"}
            aria-label="Find a board"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
          />
          <span className="hidden shrink-0 text-[11px] sm:inline">Esc to cancel</span>
        </div>
        <div role="listbox" aria-label="Boards" className="max-h-[300px] overflow-y-auto p-1.5">
          <PickerRow active={active === 0} onHover={() => setActive(0)} onClick={() => choose(0)}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--c-b-1b1b1b) text-(--c-on-ink)">
              <IconPlus size={14} color="var(--c-on-ink)" />
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{busy ? "Making board…" : q.trim() || newBoardName?.trim() ? `New board "${q.trim() || newBoardName?.trim()}"` : "New board"}</span>
            <span className="shrink-0 text-[12px] text-(--c-t-9a9a9a)">opens to draw</span>
          </PickerRow>
          {boards === undefined && <div className="px-3 py-2 text-[13px] text-(--c-t-9a9a9a)">Loading boards…</div>}
          {matches.map((b, i) => {
            const preview = b.summary
              .split("\n")
              .filter((l) => l.startsWith("- "))
              .slice(0, 2)
              .map((l) => l.slice(2))
              .join(" · ");
            return (
              <PickerRow key={b.id} active={active === i + 1} onHover={() => setActive(i + 1)} onClick={() => choose(i + 1)}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--c-b-f4f4f4) text-(--c-t-6b6b6b)">
                  <IconBoard size={14} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{b.title}</span>
                  {preview && <span className="truncate text-[12px] text-(--c-t-9a9a9a)">{preview}</span>}
                </span>
                <span className="shrink-0 text-[12px] text-(--c-t-9a9a9a)">{ago(b.updatedAt)}</span>
              </PickerRow>
            );
          })}
          {boards && !matches.length && q.trim() && <div className="px-3 py-2 text-[13px] text-(--c-t-9a9a9a)">No boards match. Press Enter to make one.</div>}
        </div>
      </div>
    </div>
  );
}

function PickerRow({ active, onHover, onClick, children }: { active: boolean; onHover: () => void; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[14px] text-(--c-t-1b1b1b) ${active ? "bg-(--c-b-f1f1ef)" : ""}`}
    >
      {children}
    </button>
  );
}

/** A frame: a square with its corner marks */
function FrameGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="M4.5 1.5v13M11.5 1.5v13M1.5 4.5h13M1.5 11.5h13" />
    </svg>
  );
}

/**
 * Second step of the picker: the whole board, or one of its frames (frames are listed left to right, top to
 * bottom, the way they sit on the board). Skipped when the board has no frames, unless a frame was asked for.
 */
function FrameStep({ boardId, framesOnly, onPick, onBack }: { boardId: string; framesOnly: boolean; onPick: (ref: string) => void; onBack: () => void }) {
  const scene = useBoardData(boardId);
  const frames = useMemo(() => {
    if (!scene) return null;
    const all = JSON.parse(scene.elements || "[]") as (Shape & { x: number; y: number })[];
    return all
      .filter((e) => !e.isDeleted && (e.type === "frame" || e.type === "magicframe"))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((f, i) => ({ id: f.id, name: f.name?.trim() || `Frame ${i + 1}` }));
  }, [scene]);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => [...(framesOnly ? [] : [{ id: "", name: "Whole board" }]), ...(frames ?? [])], [frames, framesOnly]);

  // Nothing to choose: use the whole board straight away
  useEffect(() => {
    if (frames && !frames.length && !framesOnly) onPick(boardId);
  }, [frames, framesOnly, boardId, onPick]);
  useEffect(() => list.current?.focus(), [frames]);

  const pick = (i: number) => onPick(boardRef(boardId, rows[i]?.id || null));
  return (
    <div className="overflow-hidden rounded-xl bg-(--c-b-ffffff) shadow-[0_0_0_1px_var(--c-l-e3e3e0),0_8px_28px_rgba(0,0,0,0.07)] animate-[board-pop_220ms_cubic-bezier(0.2,0,0,1)_both]">
      <div className="flex h-11 items-center gap-2 border-b border-(--c-l-ebebeb) px-2">
        <button type="button" onClick={onBack} aria-label="Back to boards" className="flex h-8 w-8 items-center justify-center rounded-lg text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-(--c-t-1b1b1b)">{scene ? scene.title : "Loading…"}</span>
        <span className="shrink-0 pr-2 text-[12px] text-(--c-t-9a9a9a)">{framesOnly ? "Pick a frame" : "Whole board or a frame"}</span>
      </div>
      <div
        ref={list}
        tabIndex={-1}
        role="listbox"
        aria-label="Frames"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (rows.length ? (a + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length : 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (rows.length) pick(active);
          } else if (e.key === "Escape" || e.key === "Backspace") {
            e.preventDefault();
            onBack();
          }
        }}
        className="max-h-[300px] overflow-y-auto p-1.5 outline-none"
      >
        {frames && !frames.length && framesOnly && (
          <div className="flex flex-col items-start gap-2 px-3 py-3 text-[13px] text-(--c-t-8a8a8a)">
            This board has no frames yet. Open it and draw one with the frame tool (F), or use the whole board.
            <button type="button" onClick={() => onPick(boardId)} className="font-medium text-(--c-t-2358d8)">
              Use the whole board
            </button>
          </div>
        )}
        {rows.map((r, i) => (
          <PickerRow key={r.id || "whole"} active={active === i} onHover={() => setActive(i)} onClick={() => pick(i)}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--c-b-f4f4f4) text-(--c-t-6b6b6b)">
              {r.id ? <FrameGlyph /> : <IconBoard size={14} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
          </PickerRow>
        ))}
      </div>
    </div>
  );
}
