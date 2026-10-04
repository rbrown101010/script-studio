"use client";

import "@excalidraw/excalidraw/index.css";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { useMutation } from "convex/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useBoardData, useIsDark } from "@/lib/boardSource";
import { uploadToUrl } from "@/lib/upload";
import { IconArrowLeft, IconX } from "./icons";

// The real Excalidraw editor (browser only)
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-[13px] text-(--c-t-9a9a9a)">Loading board…</div>,
});

type SavedFile = { id: string; url: string; mimeType: string; storageId?: Id<"_storage"> };
type El = { id: string; version: number; isDeleted?: boolean };
type BinaryFile = { id: string; dataURL: string; mimeType: string; created: number };

/** View settings worth keeping per board */
const KEEP = ["viewBackgroundColor", "gridModeEnabled", "gridSize", "gridStep", "scrollX", "scrollY", "zoom"] as const;

/**
 * One Excalidraw board. Saves itself a moment after each change (scene + images + title).
 * Full page at /b/<id>, or (with onClose) on top of a script, where Done or Esc goes back to it.
 * readOnly shows the drawing to look around in without changing it (share links, old versions).
 */
export function BoardEditor({ id, onClose, readOnly }: { id: string; onClose?: () => void; readOnly?: boolean }) {
  const board = useBoardData(id);
  const save = useMutation(api.boards.save);
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
  const [picked, setPicked] = useState({ count: 0, styleOpen: false });
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

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState("saving");
    try {
      await save({ id: boardId, elements: p.elements, appState: p.appState, files: files.current });
      setState("saved");
    } catch {
      setState("error");
    }
  }, [save, boardId]);

  useEffect(() => {
    if (initial) files.current = initial.files as SavedFile[];
  }, [initial]);

  // Changes made elsewhere (an agent drawing, another person) flow into the open editor: newer versions of an
  // element win, new ones are added, and nothing drawn here is dropped
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidraw = useRef<any>(null);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!board || !initial) return;
    if (seen.current === null) seen.current = initial.elements;
    if (board.elements === seen.current) return;
    seen.current = board.elements;
    const api = excalidraw.current;
    if (!api) return;
    void (async () => {
      const { restoreElements, CaptureUpdateAction } = await import("@excalidraw/excalidraw");
      const remote = restoreElements(JSON.parse(board.elements), null) as unknown as El[];
      const local = api.getSceneElementsIncludingDeleted() as El[];
      const at = new Map(local.map((e, i) => [e.id, i]));
      const merged = [...local];
      let changed = false;
      for (const r of remote) {
        const i = at.get(r.id);
        if (i === undefined) {
          merged.push(r);
          changed = true;
        } else if (r.version > local[i].version) {
          merged[i] = r;
          changed = true;
        }
      }
      const fresh = (board.files as SavedFile[]).filter((f) => !files.current.some((x) => x.id === f.id));
      if (fresh.length) {
        files.current = [...files.current, ...fresh];
        api.addFiles(fresh.map((f) => ({ id: f.id, dataURL: f.url, mimeType: f.mimeType, created: Date.now() })));
      }
      if (changed) api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
    })();
  }, [board, initial]);
  // Don't lose the last change when leaving
  useEffect(() => {
    const before = () => void flush();
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("beforeunload", before);
      void flush();
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
    if (count !== picked.count || styleOpen !== picked.styleOpen) setPicked({ count, styleOpen });
    if (readOnly) return;
    // Cheap change check: element versions and the background
    const key = `${elements.length}:${elements.reduce((n, e) => n + e.version, 0)}:${String(appState.viewBackgroundColor)}:${files.current.length}`;
    void storeFiles(map);
    if (key === lastKey.current) return;
    const first = lastKey.current === null && pending.current === null && state === "saved";
    lastKey.current = key;
    if (first && initial && elements.filter((e) => !e.isDeleted).length === JSON.parse(initial.elements).length) return; // the initial render
    const keep: Record<string, unknown> = {};
    for (const k of KEEP) keep[k] = appState[k];
    pending.current = { elements: JSON.stringify(elements.filter((e) => !e.isDeleted)), appState: JSON.stringify(keep) };
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
      {onClose && !readOnly && (
        <Link
          href={`/b/${id}`}
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
    <div className={`nn-board flex flex-col bg-(--c-b-ffffff) ${onClose ? "h-full" : "h-dvh"}`}>
      {/* Phones: the title row sits above the canvas so Excalidraw's toolbar gets the full width */}
      {phone && controls}
      <div className="relative min-h-0 flex-1">
        {phone && !readOnly && picked.count > 0 && <PhoneActions api={excalidraw} styleOpen={picked.styleOpen} />}
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
function PhoneActions({ api, styleOpen }: { api: React.RefObject<any>; styleOpen: boolean }) {
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
      <button type="button" onClick={() => void reorder(false)} className={btn}>
        {icon(<><rect x="3.5" y="3.5" width="9.5" height="9.5" rx="1.5" /><path d="M16.5 7.5v7a2 2 0 0 1-2 2h-7" strokeDasharray="2 2" /></>)}
        Back
      </button>
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
