"use client";

// The PDF reader: every page in a column, real text you can select, and marks on top. Select words to
// highlight them (with a comment if you like), drop a note on any spot (N, or the pin tool), write a note on
// the whole page, or record a voice note while you read. Notes live in the panel on the right, page by page.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { uploadToUrl } from "@/lib/upload";
import { initials, personColor } from "@/lib/people";
import { useGoBack, useMaybeAppSidebar, ShowSidebarButton } from "./HomeSidebar";
import { IconArrowLeft, IconTrash } from "./icons";

type Rect = { x: number; y: number; w: number; h: number };
type Note = {
  id: string;
  page: number;
  kind: "highlight" | "note";
  quote: string | null;
  rects: Rect[] | null;
  x: number | null;
  y: number | null;
  color: string | null;
  text: string;
  audioUrl: string | null;
  seconds: number | null;
  transcript: string | null;
  authorId: string | null;
  authorName: string;
  agent: boolean;
  createdAt: number;
};
type Size = { w: number; h: number };

/** Highlighter colors: how they're drawn on the page, and their dot */
const COLORS: { key: string; label: string; fill: string; dot: string }[] = [
  { key: "yellow", label: "Yellow", fill: "rgba(255, 214, 0, 0.42)", dot: "#F5C400" },
  { key: "green", label: "Green", fill: "rgba(90, 210, 120, 0.38)", dot: "#3DBE63" },
  { key: "blue", label: "Blue", fill: "rgba(80, 160, 255, 0.34)", dot: "#3B8BF5" },
  { key: "pink", label: "Pink", fill: "rgba(255, 110, 170, 0.36)", dot: "#F0609E" },
];
const colorOf = (k: string | null) => COLORS.find((c) => c.key === k) ?? COLORS[0];
const GAP = 16;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Merges the selection's boxes into one per line, as fractions of the page */
function lineRects(rects: DOMRect[], page: DOMRect): Rect[] {
  const boxes = rects
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => ({ x: (r.left - page.left) / page.width, y: (r.top - page.top) / page.height, w: r.width / page.width, h: r.height / page.height }))
    .filter((r) => r.x < 1 && r.y < 1 && r.x + r.w > 0 && r.y + r.h > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of boxes) {
    const last = out[out.length - 1];
    const sameLine = last && Math.abs(last.y + last.h / 2 - (r.y + r.h / 2)) < Math.min(last.h, r.h) * 0.5;
    if (last && sameLine && r.x <= last.x + last.w + 0.02) {
      const x = Math.min(last.x, r.x),
        y = Math.min(last.y, r.y);
      last.w = Math.max(last.x + last.w, r.x + r.w) - x;
      last.h = Math.max(last.y + last.h, r.y + r.h) - y;
      last.x = x;
      last.y = y;
    } else out.push({ ...r });
  }
  return out.map((r) => ({ x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(1, r.w), h: Math.min(1, r.h) }));
}

export function PdfReader({ id }: { id: string }) {
  const data = useQuery(api.pdfs.get, { id });
  const me = useQuery(api.users.me);
  const team = useQuery(api.users.list);
  const update = useMutation(api.pdfs.update);
  const addNoteM = useMutation(api.pdfs.addNote);
  const updateNote = useMutation(api.pdfs.updateNote);
  const removeNote = useMutation(api.pdfs.removeNote);
  const uploadUrl = useMutation(api.docs.generateUploadUrl);
  const goBack = useGoBack("/?view=pdfs");
  const side = useMaybeAppSidebar();
  useDocumentTitle(data ? data.title : null);

  // ---- The document ----
  const [doc, setDoc] = useState<any>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const url = data?.url ?? null;
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let task: any = null;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        task = pdfjs.getDocument({ url });
        const d = await task.promise;
        const list: Size[] = [];
        for (let i = 1; i <= d.numPages; i++) {
          const vp = (await d.getPage(i)).getViewport({ scale: 1 });
          list.push({ w: vp.width, h: vp.height });
        }
        if (!alive) return;
        setDoc(d);
        setSizes(list);
      } catch {
        if (alive) setLoadError("This PDF couldn't be opened.");
      }
    })();
    return () => {
      alive = false;
      task?.destroy?.();
    };
  }, [url]);
  // The exact page count, once it's known
  const pdfId = data?.id;
  const knownPages = data?.pages;
  useEffect(() => {
    if (pdfId && sizes.length && knownPages !== sizes.length) void update({ id: pdfId as Id<"pdfs">, pages: sizes.length });
  }, [pdfId, sizes.length, knownPages, update]);

  // ---- Zoom: fit the width by default ----
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [doc]);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const maxW = Math.max(1, ...sizes.map((s) => s.w));
  const fit = Math.min(2.4, Math.max(0.4, (width - 48) / maxW));
  const scale = zoom === "fit" ? fit : zoom;
  const zoomBy = (f: number) => setZoom(Math.min(4, Math.max(0.3, Math.round(scale * f * 100) / 100)));

  // ---- Where you are ----
  const [page, setPage] = useState(1);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const tops = useMemo(() => {
    const t: number[] = [];
    let y = GAP;
    for (const s of sizes) {
      t.push(y);
      y += s.h * scale + GAP;
    }
    return t;
  }, [sizes, scale]);
  const onScroll = () => {
    const el = scroller.current;
    if (!el || !tops.length) return;
    const mid = el.scrollTop + el.clientHeight * 0.35;
    let p = 1;
    for (let i = 0; i < tops.length; i++) if (tops[i] <= mid) p = i + 1;
    if (p !== page) setPage(p);
  };
  const goTo = useCallback(
    (p: number, yFrac = 0, smooth = true) => {
      const el = scroller.current;
      if (!el || !tops.length) return;
      const i = Math.max(0, Math.min(tops.length - 1, p - 1));
      el.scrollTo({ top: Math.max(0, tops[i] + yFrac * sizes[i].h * scale - 80), behavior: smooth ? "smooth" : "auto" });
    },
    [tops, sizes, scale],
  );
  // Open where you left off
  const opened = useRef(false);
  const lastPage = data?.lastPage;
  useEffect(() => {
    if (opened.current || !tops.length || !width) return;
    opened.current = true;
    if (lastPage && lastPage > 1) requestAnimationFrame(() => goTo(lastPage, 0, false));
  }, [tops, width, lastPage, goTo]);
  // Keep the page you're on, so next time it opens there (zoom keeps your place too)
  useEffect(() => {
    if (!pdfId || !opened.current) return;
    const t = setTimeout(() => void update({ id: pdfId as Id<"pdfs">, lastPage: page }), 1500);
    return () => clearTimeout(t);
  }, [page, pdfId, update]);
  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    if (prevScale.current !== scale && opened.current) goTo(page, 0, false);
    prevScale.current = scale;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // ---- Notes ----
  const notes = useMemo(() => ((data?.notes ?? []) as Note[]).slice().sort((a, b) => a.page - b.page || (a.y ?? a.rects?.[0]?.y ?? -1) - (b.y ?? b.rects?.[0]?.y ?? -1)), [data?.notes]);
  const byPage = useMemo(() => {
    const m = new Map<number, Note[]>();
    for (const n of notes) m.set(n.page, [...(m.get(n.page) ?? []), n]);
    return m;
  }, [notes]);
  const [panel, setPanel] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [tool, setTool] = useState<"read" | "pin">("read");
  const [hl, setHl] = useState("yellow");
  const panelRef = useRef<HTMLDivElement>(null);
  const showNote = (n: Note) => {
    setPanel(true);
    setFlash(n.id);
    setTimeout(() => setFlash((f) => (f === n.id ? null : f)), 1600);
    requestAnimationFrame(() => panelRef.current?.querySelector(`[data-note="${n.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const jumpTo = (n: Note) => {
    goTo(n.page, n.y ?? n.rects?.[0]?.y ?? 0);
    setFlash(n.id);
    setTimeout(() => setFlash((f) => (f === n.id ? null : f)), 1600);
  };
  const addNote = async (a: Parameters<typeof addNoteM>[0]) => {
    const nid = await addNoteM(a);
    return nid as string;
  };

  // Empty notes you started and left (closed the tab mid-note) are tidied away when you come back
  const tidied = useRef(false);
  useEffect(() => {
    if (tidied.current || !data || !me) return;
    tidied.current = true;
    for (const n of data.notes as Note[])
      if (n.kind === "note" && !n.text.trim() && !n.audioUrl && n.authorId === me.id && Date.now() - n.createdAt > 60_000) void removeNote({ id: n.id as Id<"pdfNotes"> });
  }, [data, me, removeNote]);

  // ---- Selecting words: a little bar to highlight or comment ----
  const [selBar, setSelBar] = useState<{ page: number; rects: Rect[]; quote: string; top: number; left: number } | null>(null);
  const readSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return setSelBar(null);
    const range = sel.getRangeAt(0);
    const start = (range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement)?.closest<HTMLElement>("[data-page]");
    if (!start || !scroller.current?.contains(start)) return setSelBar(null);
    const p = Number(start.dataset.page);
    const box = start.getBoundingClientRect();
    const rects = lineRects([...range.getClientRects()], box);
    // (a word split across lines with a hyphen is joined back up)
    const quote = sel.toString().replace(/(\w)-\s*\n\s*(\w)/g, "$1$2").replace(/\s+/g, " ").trim();
    if (!rects.length || !quote) return setSelBar(null);
    const last = range.getBoundingClientRect();
    setSelBar({ page: p, rects, quote: quote.slice(0, 5000), top: last.top - 46 < 60 ? last.bottom + 8 : last.top - 46, left: last.left + last.width / 2 });
  };
  const highlight = async (color: string, comment: boolean) => {
    const s = selBar;
    if (!s) return;
    setSelBar(null);
    window.getSelection()?.removeAllRanges();
    setHl(color);
    const nid = await addNote({ pdfId: id as Id<"pdfs">, page: s.page, kind: "highlight", quote: s.quote, rects: s.rects, color, text: "" });
    if (comment) {
      setPanel(true);
      setEditing(nid);
    }
  };

  // ---- Notes on a spot, or on the page ----
  const pinAt = async (p: number, x: number, y: number) => {
    setTool("read");
    const nid = await addNote({ pdfId: id as Id<"pdfs">, page: p, kind: "note", x, y, text: "" });
    setPanel(true);
    setEditing(nid);
  };
  const pageNote = async (p: number) => {
    const nid = await addNote({ pdfId: id as Id<"pdfs">, page: p, kind: "note", text: "" });
    setPanel(true);
    setEditing(nid);
  };
  /** A typed note left empty goes away (a highlight stays, it's still a highlight) */
  const doneEditing = (n: Note, text: string) => {
    setEditing(null);
    if (!text.trim() && n.kind === "note" && !n.audioUrl) void removeNote({ id: n.id as Id<"pdfNotes"> });
    else if (text !== n.text) void updateNote({ id: n.id as Id<"pdfNotes">, text });
  };

  // ---- Voice notes ----
  const [rec, setRec] = useState<{ started: number; target: string | null } | null>(null);
  const [recNow, setRecNow] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recError, setRecError] = useState<string | null>(null);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setRecNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [rec]);
  /** Starts recording: onto a note (target) or, when it stops, as a new voice note on the page you're reading */
  const startRec = async (target: string | null = null) => {
    if (rec) return;
    setRecError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported?.(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      recorder.current = r;
      r.start(250);
      const started = Date.now();
      setRecNow(started);
      setRec({ started, target });
    } catch {
      setRecError("Couldn't use the microphone. Allow it for this site and try again.");
    }
  };
  const stopRec = async (save = true) => {
    const r = recorder.current;
    const state = rec;
    if (!r || !state) return;
    setRec(null);
    const stopped = new Promise<void>((res) => (r.onstop = () => res()));
    r.stop();
    r.stream.getTracks().forEach((t) => t.stop());
    await stopped;
    recorder.current = null;
    if (!save) return;
    const mime = r.mimeType || "audio/webm";
    const blob = new Blob(chunks.current, { type: mime });
    const seconds = Math.round((Date.now() - state.started) / 100) / 10;
    if (blob.size < 500) return;
    try {
      const storageId = (await uploadToUrl(await uploadUrl(), new File([blob], `voice.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime }), () => {})) as Id<"_storage">;
      if (state.target) await updateNote({ id: state.target as Id<"pdfNotes">, audioStorageId: storageId, seconds, mime });
      else await addNote({ pdfId: id as Id<"pdfs">, page, kind: "note", text: "", audioStorageId: storageId, seconds, mime });
    } catch {
      setRecError("Couldn't save that recording. Try again.");
    }
  };

  // ---- Keys: ←/→ pages, N drops a note, V records, Escape cancels, ⌘± zoom ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable=true]");
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0")) {
        e.preventDefault();
        if (e.key === "0") setZoom("fit");
        else zoomBy(e.key === "-" ? 1 / 1.15 : 1.15);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        setSelBar(null);
        setTool("read");
        if (rec) void stopRec(false);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goTo(page + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goTo(page - 1);
      } else if (e.key.toLowerCase() === "n") setTool((t) => (t === "pin" ? "read" : "pin"));
      else if (e.key.toLowerCase() === "v") void (rec ? stopRec() : startRec());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Title ----
  const [title, setTitle] = useState<string | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeTitle = (t: string) => {
    setTitle(t);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => void update({ id: id as Id<"pdfs">, title: t }), 600);
  };

  if (data === null)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-[14px] text-(--c-t-6b6b6b)">
        This PDF isn&apos;t here anymore.
        <Link href="/?view=pdfs" className="font-medium text-(--c-t-2358d8)">
          Back to PDFs
        </Link>
      </div>
    );

  const colorFor = (authorId: string | null) => {
    const p = authorId ? team?.find((t) => t.id === authorId) : undefined;
    return p ? personColor(p.color) : "#8E8B84";
  };

  return (
    <div className="flex h-dvh flex-col bg-(--c-b-f4f4f2)">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-(--c-l-e5e5e5) bg-(--c-b-ffffff) px-2.5">
        {side && (!side.shown || side.mobile) && <ShowSidebarButton onClick={() => side.toggle(true)} />}
        <Link href="/?view=pdfs" onClick={goBack} aria-label="Back" title="Back" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
          <IconArrowLeft size={16} />
        </Link>
        <input
          value={title ?? data?.title ?? ""}
          onChange={(e) => changeTitle(e.target.value)}
          aria-label="Title"
          className="h-8 min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 text-[14.5px] font-medium text-(--c-t-1b1b1b) outline-none hover:bg-(--c-b-f4f4f4) focus:bg-(--c-b-f4f4f4)"
        />
        <span className="hidden shrink-0 px-1 text-[13px] tabular-nums text-(--c-t-737373) sm:inline">{sizes.length ? `${page} / ${sizes.length}` : ""}</span>
        <div className="flex shrink-0 items-center rounded-lg border border-(--c-l-e5e5e5)">
          <button type="button" onClick={() => zoomBy(1 / 1.15)} aria-label="Zoom out" title="Zoom out (⌘−)" className="flex h-7 w-7 items-center justify-center text-[16px] text-(--c-t-6b6b6b) hover:text-(--c-t-1b1b1b)">
            −
          </button>
          <button type="button" onClick={() => setZoom("fit")} title="Fit to width (⌘0)" className={`h-7 min-w-[46px] px-1 text-[12px] tabular-nums ${zoom === "fit" ? "text-(--c-t-1b1b1b)" : "text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"}`}>
            {Math.round(scale * 100)}%
          </button>
          <button type="button" onClick={() => zoomBy(1.15)} aria-label="Zoom in" title="Zoom in (⌘+)" className="flex h-7 w-7 items-center justify-center text-[16px] text-(--c-t-6b6b6b) hover:text-(--c-t-1b1b1b)">
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => setTool(tool === "pin" ? "read" : "pin")}
          aria-pressed={tool === "pin"}
          title="Note on a spot: click where it goes (N)"
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] ${tool === "pin" ? "bg-(--c-b-1b1b1b) text-(--c-on-ink)" : "text-(--c-t-4a4a4a) hover:bg-(--c-b-f4f4f4)"}`}
        >
          <PinIcon />
          <span className="max-md:hidden">Note</span>
        </button>
        <button
          type="button"
          onClick={() => void (rec ? stopRec() : startRec())}
          title={rec ? "Stop and save the voice note (V)" : "Record a voice note on this page (V)"}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] ${rec ? "bg-[#E24B3F] text-white" : "text-(--c-t-4a4a4a) hover:bg-(--c-b-f4f4f4)"}`}
        >
          {rec ? <span className="h-2.5 w-2.5 animate-pulse rounded-[3px] bg-white" /> : <MicIcon />}
          <span className="max-md:hidden">{rec ? `Stop ${clock((recNow - rec.started) / 1000)}` : "Voice"}</span>
        </button>
        <button
          type="button"
          onClick={() => setPanel(!panel)}
          aria-pressed={panel}
          title={panel ? "Hide notes" : "Show notes"}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] ${panel ? "bg-(--c-b-ececea) text-(--c-t-1b1b1b)" : "text-(--c-t-4a4a4a) hover:bg-(--c-b-f4f4f4)"}`}
        >
          <NotesIcon />
          <span className="tabular-nums">{notes.length || ""}</span>
        </button>
      </div>
      {recError && (
        <div className="flex items-center gap-2 bg-(--c-b-fdecea) px-4 py-1.5 text-[13px] text-(--c-t-b42318)">
          {recError}
          <button type="button" onClick={() => setRecError(null)} className="ml-auto font-medium">
            OK
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Pages */}
        <div
          ref={scroller}
          onScroll={() => {
            onScroll();
            if (selBar) setSelBar(null);
          }}
          onMouseUp={() => setTimeout(readSelection, 0)}
          onKeyUp={(e) => e.shiftKey && readSelection()}
          className={`relative min-w-0 flex-1 overflow-auto ${tool === "pin" ? "cursor-crosshair" : ""}`}
        >
          {loadError ? (
            <p className="mt-24 text-center text-[14px] text-(--c-t-737373)">{loadError}</p>
          ) : !doc || !width ? (
            <div className="mx-auto mt-4 flex w-full max-w-[760px] flex-col gap-4 px-6">
              {[0, 1].map((i) => (
                <div key={i} className="aspect-[8.5/11] w-full animate-pulse rounded-sm bg-(--c-b-ececea)" />
              ))}
            </div>
          ) : (
            <div className="relative mx-auto" style={{ width: maxW * scale + 48, height: (tops[tops.length - 1] ?? 0) + (sizes[sizes.length - 1]?.h ?? 0) * scale + GAP * 3 }}>
              {sizes.map((s, i) => (
                <PageView
                  key={i}
                  doc={doc}
                  n={i + 1}
                  size={s}
                  scale={scale}
                  top={tops[i]}
                  left={(maxW * scale + 48 - s.w * scale) / 2}
                  root={scroller}
                  register={(el) => (el ? pageEls.current.set(i + 1, el) : pageEls.current.delete(i + 1))}
                  notes={byPage.get(i + 1) ?? []}
                  flash={flash}
                  tool={tool}
                  onPin={(x, y) => void pinAt(i + 1, x, y)}
                  onOpenNote={showNote}
                />
              ))}
            </div>
          )}
          {tool === "pin" && (
            <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
              <span className="rounded-full bg-(--c-b-1b1b1b) px-3.5 py-1.5 text-[13px] text-(--c-on-ink) shadow-lg">Click where the note goes · Esc to cancel</span>
            </div>
          )}
        </div>

        {/* Notes */}
        {panel && (
          <aside ref={panelRef} className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-(--c-l-e5e5e5) bg-(--c-b-ffffff) max-md:absolute max-md:inset-y-12 max-md:right-0 max-md:z-30 max-md:w-[min(340px,90vw)] max-md:shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-(--c-l-ececec) bg-(--c-b-ffffff) px-4 py-2.5">
              <span className="flex-1 text-[13px] font-medium text-(--c-t-1b1b1b)">Notes</span>
              <button type="button" onClick={() => void pageNote(page)} className="rounded-md px-2 py-1 text-[12.5px] font-medium text-(--c-t-2358d8) hover:bg-(--c-b-f4f4f4)">
                + Note on page {page}
              </button>
            </div>
            {!notes.length ? (
              <div className="px-5 py-8 text-[13.5px] leading-[1.6] text-(--c-t-8a8a8a)">
                <p className="m-0">Select words to highlight them or comment.</p>
                <p className="m-0 mt-2">Press N (or Note) and click to leave a note on a spot, or V to record a voice note on the page you&apos;re reading.</p>
              </div>
            ) : (
              <div className="pb-10">
                {[...byPage.entries()].map(([p, list]) => (
                  <div key={p}>
                    <button type="button" onClick={() => goTo(p)} className={`block w-full px-4 pb-1 pt-3.5 text-left text-[11.5px] font-medium uppercase tracking-[0.05em] ${p === page ? "text-(--c-t-1b1b1b)" : "text-(--c-t-9a9a9a)"} hover:text-(--c-t-1b1b1b)`}>
                      Page {p}
                    </button>
                    {list.map((n) => (
                      <NoteCard
                        key={n.id}
                        note={n}
                        editing={editing === n.id}
                        flash={flash === n.id}
                        mine={!!me && n.authorId === me.id}
                        authorColor={colorFor(n.authorId)}
                        recording={rec?.target === n.id ? clock((recNow - rec.started) / 1000) : null}
                        onJump={() => jumpTo(n)}
                        onEdit={() => setEditing(n.id)}
                        onDone={(t) => doneEditing(n, t)}
                        onColor={(c) => void updateNote({ id: n.id as Id<"pdfNotes">, color: c })}
                        onRecord={() => void (rec ? stopRec() : startRec(n.id))}
                        onDelete={() => {
                          if (editing === n.id) setEditing(null);
                          void removeNote({ id: n.id as Id<"pdfNotes"> });
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* The bar over selected words */}
      {selBar && (
        <div
          className="fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-(--c-b-1b1b1b) p-1 shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
          style={{ top: selBar.top, left: selBar.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => void highlight(c.key, false)}
              aria-label={`Highlight ${c.label.toLowerCase()}`}
              title={`Highlight ${c.label.toLowerCase()}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/10"
            >
              <span className={`h-4 w-4 rounded-full ${hl === c.key ? "ring-2 ring-white" : ""}`} style={{ background: c.dot }} />
            </button>
          ))}
          <span className="mx-0.5 h-5 w-px bg-white/20" />
          <button type="button" onClick={() => void highlight(hl, true)} className="h-7 rounded-lg px-2.5 text-[13px] font-medium text-white hover:bg-white/10">
            Comment
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(selBar.quote);
              setSelBar(null);
            }}
            className="h-7 rounded-lg px-2.5 text-[13px] text-white/80 hover:bg-white/10 hover:text-white"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

/** One page: drawn when it's near the screen, with its text (to select) and its marks */
const PageView = memo(function PageView({
  doc,
  n,
  size,
  scale,
  top,
  left,
  root,
  register,
  notes,
  flash,
  tool,
  onPin,
  onOpenNote,
}: {
  doc: any;
  n: number;
  size: Size;
  scale: number;
  top: number;
  left: number;
  root: React.RefObject<HTMLDivElement | null>;
  register: (el: HTMLDivElement | null) => void;
  notes: Note[];
  flash: string | null;
  tool: "read" | "pin";
  onPin: (x: number, y: number) => void;
  onOpenNote: (n: Note) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textEl = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const w = size.w * scale,
    h = size.h * scale;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: root.current, rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: any = null;
    let text: any = null;
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      const page = await doc.getPage(n);
      if (cancelled || !canvas.current || !textEl.current) return;
      const vp = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const c = canvas.current;
      c.width = Math.floor(vp.width * dpr);
      c.height = Math.floor(vp.height * dpr);
      task = page.render({ canvas: c, canvasContext: c.getContext("2d"), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      setDrawn(true);
      const t = textEl.current;
      t.replaceChildren();
      t.style.setProperty("--scale-factor", String(scale));
      t.style.setProperty("--total-scale-factor", String(scale));
      text = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: t, viewport: vp });
      try {
        await text.render();
      } catch {}
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
      text?.cancel?.();
    };
  }, [near, doc, n, scale]);

  return (
    <div
      ref={(el) => {
        box.current = el;
        register(el);
      }}
      data-page={n}
      className="absolute bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_6px_20px_rgba(0,0,0,0.06)]"
      style={{ top, left, width: w, height: h }}
      onClick={(e) => {
        if (tool !== "pin") return;
        const r = e.currentTarget.getBoundingClientRect();
        onPin((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" style={{ opacity: drawn ? 1 : 0 }} />
      {/* Highlights sit under the text, so the words stay selectable */}
      <div className="pointer-events-none absolute inset-0" style={{ mixBlendMode: "multiply" }}>
        {notes
          .filter((x) => x.kind === "highlight" && x.rects)
          .flatMap((x) =>
            x.rects!.map((r, i) => (
              <div
                key={`${x.id}-${i}`}
                className="absolute rounded-[2px] transition-shadow"
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                  background: colorOf(x.color).fill,
                  boxShadow: flash === x.id ? `0 0 0 3px ${colorOf(x.color).dot}` : undefined,
                }}
              />
            )),
          )}
      </div>
      <div ref={textEl} className="textLayer" style={{ pointerEvents: tool === "pin" ? "none" : undefined }} />
      {/* Click a highlight's corner mark (or a pin) to see its note */}
      {notes
        .filter((x) => x.kind === "highlight" && x.rects?.length && (x.text || x.audioUrl))
        .map((x) => {
          const r = x.rects![x.rects!.length - 1];
          return (
            <button
              key={`c-${x.id}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenNote(x);
              }}
              title={x.text || "Voice note"}
              className="absolute z-10 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full text-white shadow"
              style={{ left: `calc(${(r.x + r.w) * 100}% + 2px)`, top: `${r.y * 100}%`, background: colorOf(x.color).dot }}
            >
              <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">
                <path d="M2.5 3h11v7.5H7l-3 2.5v-2.5H2.5z" />
              </svg>
            </button>
          );
        })}
      {notes
        .filter((x) => x.kind === "note" && x.x !== null && x.y !== null)
        .map((x) => (
          <button
            key={`p-${x.id}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenNote(x);
            }}
            title={x.text || x.transcript || (x.audioUrl ? "Voice note" : "Note")}
            className={`absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none text-white shadow-md transition-transform hover:scale-110 ${flash === x.id ? "scale-125" : ""}`}
            style={{ left: `${x.x! * 100}%`, top: `${x.y! * 100}%`, background: x.audioUrl ? "#E24B3F" : "#2B2B2C" }}
          >
            {x.audioUrl ? <MicIcon size={13} /> : <NotesIcon size={13} />}
          </button>
        ))}
      <span className="pointer-events-none absolute -bottom-[14px] right-0 text-[10.5px] tabular-nums text-(--c-t-9a9a9a)">{n}</span>
    </div>
  );
});

function NoteCard({
  note: n,
  editing,
  flash,
  mine,
  authorColor,
  recording,
  onJump,
  onEdit,
  onDone,
  onColor,
  onRecord,
  onDelete,
}: {
  note: Note;
  editing: boolean;
  flash: boolean;
  mine: boolean;
  authorColor: string;
  recording: string | null;
  onJump: () => void;
  onEdit: () => void;
  onDone: (text: string) => void;
  onColor: (c: string) => void;
  onRecord: () => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(n.text);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) return;
    setText(n.text);
    requestAnimationFrame(() => area.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const label = n.kind === "highlight" ? null : n.audioUrl ? "Voice note" : n.x !== null ? "Note on a spot" : "Note on the page";
  return (
    <div
      data-note={n.id}
      className={`group/note relative mx-2 mb-1 rounded-xl px-2.5 py-2.5 transition-colors ${flash ? "bg-(--c-b-fdf3cf)" : "hover:bg-(--c-b-f7f7f5)"}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ background: n.agent ? "#8E8B84" : authorColor }} title={n.authorName}>
          {n.agent ? "AI" : initials(n.authorName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] text-(--c-t-9a9a9a)">
            <span className="truncate font-medium text-(--c-t-4a4a4a)">{n.authorName}</span>
            <span>·</span>
            <span className="shrink-0">{ago(n.createdAt)}</span>
            {label && <span className="truncate">· {label}</span>}
          </div>
          {n.quote && (
            <button type="button" onClick={onJump} className="mt-1 block w-full text-left">
              <span className="line-clamp-4 border-l-[3px] pl-2 text-[13px] leading-[1.5] text-(--c-t-4a4a4a)" style={{ borderColor: colorOf(n.color).dot }}>
                {n.quote}
              </span>
            </button>
          )}
          {n.audioUrl && <audio controls preload="none" src={n.audioUrl} className="mt-1.5 h-8 w-full" />}
          {n.transcript && <p className="m-0 mt-1 text-[12.5px] italic leading-[1.5] text-(--c-t-6b6b6b)">“{n.transcript}”</p>}
          {editing ? (
            <textarea
              ref={area}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => onDone(text)}
              onKeyDown={(e) => {
                if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
                e.stopPropagation();
              }}
              placeholder={n.kind === "highlight" ? "Add a comment…" : "Write a note…"}
              rows={Math.min(10, Math.max(2, text.split("\n").length))}
              className="mt-1.5 w-full resize-none rounded-lg border border-(--c-l-dcdcdc) bg-(--c-b-ffffff) px-2 py-1.5 text-[13.5px] leading-[1.5] text-(--c-t-1b1b1b) outline-none focus:border-(--c-l-8a8a8a)"
            />
          ) : n.text ? (
            <button type="button" onClick={mine || !n.agent ? onEdit : onJump} className="mt-1 block w-full whitespace-pre-wrap break-words text-left text-[13.5px] leading-[1.5] text-(--c-t-1b1b1b)">
              {n.text}
            </button>
          ) : n.kind === "highlight" && !n.audioUrl ? (
            <button type="button" onClick={onEdit} className="mt-1 text-[12.5px] text-(--c-t-9a9a9a) hover:text-(--c-t-1b1b1b)">
              Add a comment
            </button>
          ) : null}
          {/* Hover tools: jump to it, color, record onto it, delete */}
          <div className={`mt-1.5 flex items-center gap-0.5 ${recording ? "" : "opacity-0 group-hover/note:opacity-100 group-focus-within/note:opacity-100 pointer-coarse:opacity-100"}`}>
            <button type="button" onClick={onJump} className="h-6 rounded px-1.5 text-[12px] text-(--c-t-737373) hover:bg-(--c-b-ececea) hover:text-(--c-t-1b1b1b)">
              Show
            </button>
            {n.kind === "highlight" &&
              COLORS.map((c) => (
                <button key={c.key} type="button" onClick={() => onColor(c.key)} aria-label={`Make it ${c.label.toLowerCase()}`} className="flex h-6 w-5 items-center justify-center">
                  <span className={`h-3 w-3 rounded-full ${colorOf(n.color).key === c.key ? "ring-2 ring-(--c-t-9a9a9a) ring-offset-1" : ""}`} style={{ background: c.dot }} />
                </button>
              ))}
            <button
              type="button"
              onClick={onRecord}
              className={`flex h-6 items-center gap-1 rounded px-1.5 text-[12px] ${recording ? "bg-[#E24B3F] text-white" : "text-(--c-t-737373) hover:bg-(--c-b-ececea) hover:text-(--c-t-1b1b1b)"}`}
              title={recording ? "Stop and save" : n.audioUrl ? "Record again" : "Record a voice note here"}
            >
              <MicIcon size={12} />
              {recording ? `Stop ${recording}` : n.audioUrl ? "Re-record" : "Voice"}
            </button>
            <button type="button" onClick={onDelete} aria-label="Delete" title="Delete" className="ml-auto flex h-6 w-6 items-center justify-center rounded text-(--c-t-9a9a9a) hover:bg-(--c-b-ececea) hover:text-(--c-t-b42318)">
              <IconTrash size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 2.75h10v8H8.5L5.5 13.5v-2.75H3z" />
      <path d="M6 6.75h4" strokeLinecap="round" />
    </svg>
  );
}
function NotesIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3.25h10M3 6.5h10M3 9.75h6.5" />
    </svg>
  );
}
function MicIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5.75" y="1.75" width="4.5" height="8" rx="2.25" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25" />
    </svg>
  );
}
