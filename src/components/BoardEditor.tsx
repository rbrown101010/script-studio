"use client";

import "@excalidraw/excalidraw/index.css";
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
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const dark = useIsDark();
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
    <div className="nn-board-controls flex h-(--lg-button-size) items-center gap-0.5 rounded-lg bg-(--island-bg-color) px-1 shadow-(--shadow-island)">
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
      <div className="min-h-0 flex-1">
        {initial && (
          <Excalidraw
            theme={dark ? "dark" : "light"}
            name={initial.title}
            viewModeEnabled={readOnly}
            excalidrawAPI={(api) => (excalidraw.current = api)}
            renderTopRightUI={() => controls}
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

