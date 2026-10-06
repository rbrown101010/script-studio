"use client";

import "@excalidraw/excalidraw/index.css";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { useConvex, useMutation, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useBoardData, useIsDark } from "@/lib/boardSource";
import { uploadToUrl } from "@/lib/upload";
import { IconArrowLeft, IconPin, IconX } from "./icons";
import { SidebarIcon, useMaybeAppSidebar } from "./HomeSidebar";
import { BlurLayer, BlurToggle, blurView, blursOnTop, isBlur, setBlur, type BlurEl, type BlurView } from "./boardBlur";
import { GradientControls, gradientSelection, setGradient, type GradientSelection } from "./boardGradient";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

// The real Excalidraw editor (browser only)
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-[13px] text-(--c-t-9a9a9a)">Loading board…</div>,
});

type SavedFile = { id: string; url: string; mimeType: string; storageId?: Id<"_storage"> };
type El = { id: string; version: number; versionNonce: number; isDeleted?: boolean; updated?: number };
type BinaryFile = { id: string; dataURL: string; mimeType: string; created: number };

/** How long a deleted element is kept in the saved scene, so other open copies of the board learn it was deleted */
const TOMBSTONE_MS = 24 * 60 * 60 * 1000;

/**
 * The scene as saved: everything, including deleted elements (with their bumped versions), so another tab that
 * still has an element sees the newer, deleted copy and removes it instead of saving it back. Old deletions are
 * dropped to keep the board small.
 */
function sceneJson(elements: readonly El[]) {
  const cutoff = Date.now() - TOMBSTONE_MS;
  return JSON.stringify(elements.filter((e) => !e.isDeleted || (e.updated ?? 0) > cutoff));
}

/** View settings worth keeping per board */
const KEEP = ["viewBackgroundColor", "gridModeEnabled", "gridSize", "gridStep", "scrollX", "scrollY", "zoom"] as const;

/**
 * One Excalidraw board. Saves itself a moment after each change (scene + images + title).
 * Full page at /b/<id>, or (with onClose) on top of a script, where Done or Esc goes back to it.
 * readOnly shows the drawing to look around in without changing it (share links, old versions).
 */
export function BoardEditor({ id, onClose, readOnly, focus }: { id: string; onClose?: () => void; readOnly?: boolean; /** A frame to zoom to on open */ focus?: string | null }) {
  const board = useBoardData(id);
  // Full-page boards sit beside the app sidebar; a button here hides it for more canvas or brings it back
  const appSidebar = useMaybeAppSidebar();
  const sidebarToggle = !onClose && !readOnly ? appSidebar : null;
  const save = useMutation(api.boards.save);
  const convex = useConvex();
  const pinnedList = useQuery(api.boards.pinned, readOnly ? "skip" : {});
  const isPinned = !!pinnedList?.some((p) => p.id === id);
  const setPinned = useMutation(api.boards.setPinned);
  const uploadUrl = useMutation(api.docs.generateUploadUrl);
  const fileUrl = useMutation(api.docs.fileUrl);
  // Load once: later saves come from this editor, so the live copy isn't pushed back into it
  const [initial, setInitial] = useState<typeof board>(undefined);
  useEffect(() => {
    if (board !== undefined && initial === undefined) setInitial(board);
  }, [board, initial]);
  const [title, setTitle] = useState<string | null>(null);
  // On a script (opened over it) the tab keeps the script's name
  useDocumentTitle(onClose ? null : board === null ? "Board not found" : (title ?? initial?.title ?? null));
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const dark = useIsDark();
  // Phone layout: the same breakpoint Excalidraw uses for its own phone UI
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 599px), (max-height: 499px) and (max-width: 1000px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  /** What's selected right now (drives the phone action bar) */
  const [picked, setPicked] = useState<{ count: number; styleOpen: boolean; frame: string | null }>({ count: 0, styleOpen: false, frame: null });
  const [copied, setCopied] = useState(false);
  /** Blur rectangles: where they are on screen, and whether the selected rectangles are blurred (null: none selected) */
  const [blurs, setBlurs] = useState<BlurView>({ boxes: [], width: 0, height: 0, zoom: 1 });
  const [blurPicked, setBlurPicked] = useState<boolean | null>(null);
  const [gradientPicked, setGradientPicked] = useState<GradientSelection | null>(null);
  const boardRoot = useRef<HTMLDivElement>(null);
  const reordering = useRef(false);
  /** Copy a link to the selected frame; pasted on an empty line in a script it becomes a frame block */
  const copyFrame = () => {
    if (!picked.frame) return;
    void navigator.clipboard.writeText(`${window.location.origin}/b/${id}#frame=${picked.frame}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  /** Excalidraw's latest view state, so Esc only closes when it isn't busy with a tool, selection or menu */
  const ui = useRef<Record<string, unknown>>({});
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[data-command-palette]")) return;
      const s = ui.current;
      const busy =
        Object.keys((s.selectedElementIds as object) ?? {}).length > 0 ||
        !!s.editingTextElement ||
        !!s.newElement ||
        !!s.openDialog ||
        !!s.openMenu ||
        !!s.openPopup ||
        !!s.contextMenu ||
        ((s.activeTool as { type?: string })?.type ?? "selection") !== "selection";
      if (busy || (e.target as HTMLElement).closest?.("input, textarea")) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const boardId = id as Id<"boards">;
  const files = useRef<SavedFile[]>([]);
  const uploading = useRef(new Set<string>());
  const lastKey = useRef<string | null>(null);
  const pending = useRef<{ elements: string; appState: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidraw = useRef<any>(null);

  /**
   * Brings another copy of the scene (the saved board, changed by another tab, an agent or another person) into
   * the open editor, element by element: whichever copy of an element has the higher version wins (deletions
   * included), new ones are added, and nothing drawn here is dropped. Excalidraw's own collaboration merge.
   */
  const mergeIn = useCallback(async (json: string) => {
    const ex = excalidraw.current;
    if (!ex) return;
    const { restoreElements, reconcileElements, CaptureUpdateAction } = await import("@excalidraw/excalidraw");
    const remote = restoreElements(JSON.parse(json), null) as unknown as El[];
    const local = ex.getSceneElementsIncludingDeleted() as El[];
    const byId = new Map(local.map((e) => [e.id, e]));
    const newer = remote.some((r) => {
      const l = byId.get(r.id);
      return !l || r.version > l.version || (r.version === l.version && r.versionNonce < l.versionNonce);
    });
    if (!newer) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged = reconcileElements(local as any, remote as any, ex.getAppState());
    ex.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
  }, []);

  /** Saves the scene. First picks up anything saved meanwhile (another tab), so a save never undoes it. */
  const flush = useCallback(
    async (fresh = true) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      setState("saving");
      try {
        let elements = p.elements;
        if (fresh && excalidraw.current) {
          const latest = await convex.query(api.boards.get, { id: boardId });
          if (latest) await mergeIn(latest.elements);
          if (excalidraw.current) elements = sceneJson(excalidraw.current.getSceneElementsIncludingDeleted());
        }
        await save({ id: boardId, elements, appState: p.appState, files: files.current });
        setState("saved");
      } catch {
        setState("error");
      }
    },
    [save, boardId, convex, mergeIn],
  );

  useEffect(() => {
    if (initial) files.current = initial.files as SavedFile[];
  }, [initial]);

  // Changes made elsewhere (another tab, an agent drawing, another person) flow into the open editor (see mergeIn)
  // Opened from a frame block: zoom to that frame once the board is up
  useEffect(() => {
    if (!focus || !initial) return;
    let tries = 0;
    const t = setInterval(() => {
      const api = excalidraw.current;
      const el = api?.getSceneElements().find((e: { id: string }) => e.id === focus);
      if (el) api.scrollToContent(el, { fitToViewport: true, viewportZoomFactor: 0.85, animate: false });
      if (el || ++tries > 30) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [focus, initial]);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!board || !initial) return;
    if (seen.current === null) seen.current = initial.elements;
    if (board.elements === seen.current) return;
    seen.current = board.elements;
    const ex = excalidraw.current;
    if (!ex) return;
    const fresh = (board.files as SavedFile[]).filter((f) => !files.current.some((x) => x.id === f.id));
    if (fresh.length) {
      files.current = [...files.current, ...fresh];
      ex.addFiles(fresh.map((f) => ({ id: f.id, dataURL: f.url, mimeType: f.mimeType, created: Date.now() })));
    }
    void mergeIn(board.elements);
  }, [board, initial, mergeIn]);
  // Don't lose the last change when leaving (no time to check for newer saves first)
  useEffect(() => {
    const before = () => void flush(false);
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("beforeunload", before);
      void flush(false);
    };
  }, [flush]);

  /** Pasted or dropped images become files in Native Note storage */
  const storeFiles = async (map: Record<string, BinaryFile>) => {
    for (const f of Object.values(map)) {
      if (!f.dataURL?.startsWith("data:") || files.current.some((x) => x.id === f.id) || uploading.current.has(f.id)) continue;
      uploading.current.add(f.id);
      try {
        const blob = await (await fetch(f.dataURL)).blob();
        const target = await uploadUrl();
        const storageId = (await uploadToUrl(target, new File([blob], f.id, { type: f.mimeType }), () => {})) as Id<"_storage">;
        const url = await fileUrl({ storageId });
        if (url) files.current = [...files.current, { id: f.id, url, mimeType: f.mimeType, storageId }];
        lastKey.current = null; // make sure the file list gets saved
      } catch {
        setState("error");
      } finally {
        uploading.current.delete(f.id);
      }
    }
  };

  const onChange = (elements: readonly El[], appState: Record<string, unknown>, map: Record<string, BinaryFile>) => {
    ui.current = appState;
    const count = appState.editingTextElement ? 0 : Object.keys((appState.selectedElementIds as object) ?? {}).length;
    const styleOpen = appState.openMenu === "shape";
    const only = count === 1 ? Object.keys(appState.selectedElementIds as object)[0] : null;
    const frame = only && elements.some((e) => e.id === only && ((e as { type?: string }).type === "frame" || (e as { type?: string }).type === "magicframe")) ? only : null;
    if (count !== picked.count || styleOpen !== picked.styleOpen || frame !== picked.frame) setPicked({ count, styleOpen, frame });
    const view = blurView(elements as unknown as BlurEl[], appState);
    if (JSON.stringify(view) !== JSON.stringify(blurs)) setBlurs(view);
    const sel = (appState.selectedElementIds as Record<string, boolean>) ?? {};
    const rects = count ? (elements as unknown as BlurEl[]).filter((e) => sel[e.id] && !e.isDeleted && e.type === "rectangle") : [];
    const blurNow = rects.length ? rects.every(isBlur) : null;
    if (blurNow !== blurPicked) setBlurPicked(blurNow);
    const gradientNow = gradientSelection(elements as unknown as ExcalidrawElement[], sel);
    if (JSON.stringify(gradientNow) !== JSON.stringify(gradientPicked)) setGradientPicked(gradientNow);
    if (readOnly) return;
    // Blurs always sit on top: anything drawn or moved above one goes back under it (once nothing is mid-gesture)
    if (!reordering.current && !appState.newElement && !appState.selectedElementsAreBeingDragged && !appState.resizingElement && !appState.editingTextElement && blursOnTop(elements as unknown as BlurEl[])) {
      reordering.current = true;
      setTimeout(async () => {
        reordering.current = false;
        const ex = excalidraw.current;
        const next = ex && blursOnTop(ex.getSceneElementsIncludingDeleted() as BlurEl[]);
        if (!next) return;
        const { CaptureUpdateAction } = await import("@excalidraw/excalidraw");
        ex.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER });
      }, 0);
    }
    // Cheap change check: element versions and the background
    const key = `${elements.length}:${elements.reduce((n, e) => n + e.version, 0)}:${String(appState.viewBackgroundColor)}:${files.current.length}`;
    void storeFiles(map);
    if (key === lastKey.current) return;
    const first = lastKey.current === null && pending.current === null && state === "saved";
    lastKey.current = key;
    if (first && initial && elements.filter((e) => !e.isDeleted).length === (JSON.parse(initial.elements) as El[]).filter((e) => !e.isDeleted).length) return; // the initial render
    const keep: Record<string, unknown> = {};
    for (const k of KEEP) keep[k] = appState[k];
    pending.current = { elements: sceneJson(elements), appState: JSON.stringify(keep) };
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  };

  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeTitle = (t: string) => {
    setTitle(t);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => void save({ id: boardId, title: t }), 600);
  };

  if (board === null)
    return (
      <div className={`flex flex-col items-center justify-center gap-3 bg-(--c-b-ffffff) text-[14px] text-(--c-t-737373) ${onClose ? "h-full" : "min-h-screen"}`}>
        This board doesn&apos;t exist anymore.
        {onClose ? (
          <button type="button" onClick={onClose} className="font-medium text-(--c-t-2358d8)">
            Back to the script
          </button>
        ) : (
          <Link href="/" className="font-medium text-(--c-t-2358d8)">
            Back
          </Link>
        )}
      </div>
    );

  // A small floating control instead of a bar: back (or Done), the title, and a save dot, beside Excalidraw's own buttons
  const controls = (
    <div
      className={`nn-board-controls flex items-center gap-0.5 ${
        phone ? "h-11 shrink-0 border-b border-(--c-l-ebebeb) bg-(--c-b-ffffff) px-1.5 [&_input]:flex-1" : "h-(--lg-button-size) rounded-lg bg-(--island-bg-color) px-1 shadow-(--shadow-island)"
      }`}
    >
      {sidebarToggle && (
        <button
          type="button"
          onClick={() => sidebarToggle.toggle(!sidebarToggle.shown || sidebarToggle.mobile)}
          aria-label={sidebarToggle.shown && !sidebarToggle.mobile ? "Hide sidebar" : "Show sidebar"}
          title={sidebarToggle.shown && !sidebarToggle.mobile ? "Hide sidebar" : "Show sidebar"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--c-t-6b6b6b) hover:bg-(--button-hover-bg)"
        >
          <SidebarIcon size={16} />
        </button>
      )}
      {onClose ? null : (
        <Link
          href="/?view=boards"
          title="Back to Excalidraw"
          aria-label="Back to Excalidraw"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--c-t-6b6b6b)! no-underline hover:bg-(--button-hover-bg)"
        >
          <IconArrowLeft size={15} />
        </Link>
      )}
      <input
        value={title ?? initial?.title ?? ""}
        onChange={(e) => changeTitle(e.target.value)}
        readOnly={readOnly}
        placeholder="Untitled board"
        aria-label="Board title"
        size={Math.min(28, Math.max(8, (title ?? initial?.title ?? "").length + 1))}
        className={`h-7 min-w-0 rounded-md bg-transparent px-1.5 text-[13px] font-medium text-(--c-t-1b1b1b) outline-none ${readOnly ? "" : "hover:bg-(--button-hover-bg) focus:bg-(--button-hover-bg)"}`}
      />
      {!readOnly && (
        <span
          title={state === "saving" ? "Saving…" : state === "error" ? "Couldn't save, retrying on your next change" : "Saved"}
          aria-label={state === "saving" ? "Saving" : state === "error" ? "Not saved" : "Saved"}
          className={`mx-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${state === "error" ? "bg-[#e03131]" : state === "saving" ? "bg-[#f08c00]" : "bg-[#40c057]"}`}
        />
      )}
      {!readOnly && pinnedList && (
        <button
          type="button"
          onClick={() => void setPinned({ id: id as Id<"boards">, pinned: !isPinned })}
          aria-pressed={isPinned}
          aria-label={isPinned ? "Unpin from the sidebar" : "Pin to the sidebar"}
          title={isPinned ? "Unpin from the sidebar" : "Pin to the sidebar"}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-(--button-hover-bg) ${isPinned ? "text-(--c-t-2358d8)" : "text-(--c-t-6b6b6b)"}`}
        >
          <IconPin size={14} filled={isPinned} />
        </button>
      )}
      {picked.frame && (
        <button
          type="button"
          onClick={copyFrame}
          title="Copy this frame, then paste it on an empty line in a script to show it there"
          className="ml-0.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-(--c-b-1b1b1b) px-2.5 text-[12px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333)"
        >
          {copied ? "Copied" : "Copy frame"}
        </button>
      )}
      {onClose && !readOnly && (
        <Link
          href={`/b/${id}${focus ? `#frame=${focus}` : ""}`}
          target="_blank"
          title="Open full page"
          aria-label="Open full page"
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--c-t-6b6b6b)! no-underline hover:bg-(--button-hover-bg) sm:flex"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 2.5h4.5V7M13.5 2.5 8 8M6.5 3.5H3.5v9h9v-3" />
          </svg>
        </Link>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          title="Back to the script (Esc)"
          className="ml-0.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-(--c-b-1b1b1b) px-2.5 text-[12px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333)"
        >
          {readOnly ? <IconX size={12} color="var(--c-on-ink)" /> : null}
          {readOnly ? "Close" : "Done"}
        </button>
      )}
    </div>
  );

  return (
    <div ref={boardRoot} className={`nn-board flex flex-col bg-(--c-b-ffffff) ${onClose ? "h-full" : "h-dvh"}`}>
      <BlurLayer root={boardRoot} view={blurs} dark={dark} />
      {!readOnly && <GradientControls root={boardRoot} selection={gradientPicked} onChange={(gradient) => void setGradient(excalidraw.current, gradient)} />}
      {!readOnly && blurPicked !== null && <BlurToggle root={boardRoot} on={blurPicked} onToggle={() => void setBlur(excalidraw.current, !blurPicked)} />}
      {/* Phones: the title row sits above the canvas so Excalidraw's toolbar gets the full width */}
      {phone && controls}
      <div className="relative min-h-0 flex-1">
        {phone && !readOnly && picked.count > 0 && <PhoneActions api={excalidraw} styleOpen={picked.styleOpen} onCopyFrame={picked.frame ? copyFrame : undefined} copied={copied} />}
        {initial && (
          <Excalidraw
            theme={dark ? "dark" : "light"}
            name={initial.title}
            viewModeEnabled={readOnly}
            excalidrawAPI={(api) => (excalidraw.current = api)}
            renderTopRightUI={() => (phone ? null : controls)}
            initialData={{
              elements: JSON.parse(initial.elements),
              appState: { ...JSON.parse(initial.appState || "{}"), collaborators: new Map() },
              files: Object.fromEntries(
                (initial.files as SavedFile[]).map((f) => [f.id, { id: f.id, dataURL: f.url, mimeType: f.mimeType, created: 0 }]),
              ) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
              scrollToContent: !JSON.parse(initial.appState || "{}").scrollX,
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={onChange as any}
          />
        )}
      </div>
    </div>
  );
}


/**
 * Phones: big, labelled buttons for whatever is selected, above Excalidraw's bottom bar. Style opens Excalidraw's
 * own style panel; Duplicate and Delete use Excalidraw's own actions (so undo works); Front/Back reorder;
 * More opens the full menu (copy, paste, group, lock, flip, link…), the same as a long press.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PhoneActions({ api, styleOpen, onCopyFrame, copied }: { api: React.RefObject<any>; styleOpen: boolean; onCopyFrame?: () => void; copied: boolean }) {
  const click = (selector: string) => document.querySelector<HTMLButtonElement>(`.nn-board .App-toolbar-content ${selector}`)?.click();
  const reorder = async (toFront: boolean) => {
    const a = api.current;
    if (!a) return;
    const { CaptureUpdateAction } = await import("@excalidraw/excalidraw");
    const all = a.getSceneElementsIncludingDeleted() as { id: string; containerId?: string | null }[];
    const pick = new Set(Object.keys(a.getAppState().selectedElementIds ?? {}));
    for (const e of all) if (e.containerId && pick.has(e.containerId)) pick.add(e.id);
    const moving = all.filter((e) => pick.has(e.id));
    const rest = all.filter((e) => !pick.has(e.id));
    a.updateScene({ elements: toFront ? [...rest, ...moving] : [...moving, ...rest], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };
  const more = () => {
    const a = api.current;
    if (!a) return;
    const st = a.getAppState();
    const sel = (a.getSceneElements() as { id: string; x: number; y: number; width: number; height: number }[]).filter((e) => st.selectedElementIds?.[e.id]);
    if (!sel.length) return;
    const minX = Math.min(...sel.map((e) => e.x));
    const minY = Math.min(...sel.map((e) => e.y));
    const maxX = Math.max(...sel.map((e) => e.x + e.width));
    const x = ((minX + maxX) / 2 + st.scrollX) * st.zoom.value + st.offsetLeft;
    const y = (minY + st.scrollY) * st.zoom.value + st.offsetTop + 8;
    const canvas = document.querySelector(".nn-board canvas.interactive") ?? document.querySelectorAll(".nn-board .excalidraw canvas")[1];
    canvas?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: Math.max(60, y) }));
  };
  const btn = "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-medium text-(--c-t-4a4a4a) active:bg-(--c-b-f1f1ef)";
  const icon = (d: React.ReactNode) => (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
  return (
    <div
      role="toolbar"
      aria-label="Selected"
      className="absolute inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-10 flex items-stretch gap-0.5 rounded-2xl bg-(--c-b-ffffff) p-1 shadow-[0_0_0_1px_var(--c-l-e3e3e0),0_8px_28px_rgba(0,0,0,0.18)] animate-[board-pop_180ms_cubic-bezier(0.2,0,0,1)_both]"
    >
      <button type="button" onClick={() => click('button[aria-label="Edit"]')} aria-pressed={styleOpen} className={`${btn} ${styleOpen ? "bg-(--c-b-f1f1ef) text-(--c-t-1b1b1b)" : ""}`}>
        {icon(<><circle cx="10" cy="10" r="7" /><circle cx="7" cy="8" r="1" fill="currentColor" /><circle cx="11" cy="6.5" r="1" fill="currentColor" /><circle cx="13.5" cy="10" r="1" fill="currentColor" /><path d="M10 17a2 2 0 0 1 0-4h1" /></>)}
        Style
      </button>
      <button type="button" onClick={() => click('button[aria-label="Duplicate"]')} className={btn}>
        {icon(<><rect x="6.5" y="6.5" width="10" height="10" rx="2" /><path d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" /></>)}
        Duplicate
      </button>
      <button type="button" onClick={() => void reorder(true)} className={btn}>
        {icon(<><rect x="7" y="7" width="9.5" height="9.5" rx="1.5" fill="currentColor" fillOpacity="0.25" /><path d="M3.5 12.5v-7a2 2 0 0 1 2-2h7" /></>)}
        Front
      </button>
      {onCopyFrame ? (
        // A frame is selected: copy it (paste it into a script to show just this frame)
        <button type="button" onClick={onCopyFrame} className={btn}>
          {icon(<path d="M6 3v14M14 3v14M3 6h14M3 14h14" />)}
          {copied ? "Copied" : "Copy frame"}
        </button>
      ) : (
        <button type="button" onClick={() => void reorder(false)} className={btn}>
          {icon(<><rect x="3.5" y="3.5" width="9.5" height="9.5" rx="1.5" /><path d="M16.5 7.5v7a2 2 0 0 1-2 2h-7" strokeDasharray="2 2" /></>)}
          Back
        </button>
      )}
      <button type="button" onClick={() => click('button[aria-label="Delete"]')} className={`${btn} text-[#e03131]!`}>
        {icon(<><path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6" /></>)}
        Delete
      </button>
      <button type="button" onClick={more} className={btn}>
        {icon(<><circle cx="5" cy="10" r="1.2" fill="currentColor" /><circle cx="10" cy="10" r="1.2" fill="currentColor" /><circle cx="15" cy="10" r="1.2" fill="currentColor" /></>)}
        More
      </button>
    </div>
  );
}
