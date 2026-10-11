"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { uploadToUrl } from "@/lib/upload";
import { IconTrash, IconUpload, IconX } from "./icons";

type Status = "editing" | "ready" | "posted" | "archived";
const COLUMNS: { value: Status; label: string; dot: string }[] = [
  { value: "editing", label: "Editing", dot: "#d97706" },
  { value: "ready", label: "Ready to post", dot: "#2f6fed" },
  { value: "posted", label: "Posted", dot: "#15803d" },
];

type Row = NonNullable<ReturnType<typeof useQuery<typeof api.editFeed.list>>>[number];

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/**
 * Edit Feed: short-form videos being edited. Agents add a cut (v1); you watch it, comment (at a moment if you
 * like) and press Request edits; the agent uploads v2, v3… Videos move through Editing, Ready to post, Posted.
 */
export function EditFeed() {
  const videos = useQuery(api.editFeed.list);
  const update = useMutation(api.editFeed.update);
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const archived = (videos ?? []).filter((v) => v.status === "archived");

  // ?video=<id> (a link an agent shared) opens that video
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("video");
    if (id) setOpen(id);
  }, []);
  const openVideo = (id: string | null) => {
    setOpen(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("video", id);
    else u.searchParams.delete("video");
    window.history.replaceState(null, "", u);
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">Edit Feed</h1>
          <p className="m-0 mt-1 text-[14px] text-(--c-t-737373)">Short-form cuts in review. Comment, request edits, and each new cut comes back as the next version.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowArchive(!showArchive)}
          aria-pressed={showArchive}
          title={showArchive ? "Back to the board" : "Archived videos"}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium ring-1 ${
            showArchive ? "bg-(--c-b-1b1b1b) text-(--c-on-ink) ring-transparent" : "text-(--c-t-6b6b6b) ring-(--c-l-e3e3e0) hover:text-(--c-t-1b1b1b)"
          }`}
        >
          <ArchiveIcon />
          {archived.length > 0 && <span className="tabular-nums">{archived.length}</span>}
        </button>
        <UploadButton label="Upload video" onDone={(id) => id && openVideo(id)} />
      </div>

      {showArchive && videos !== undefined && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="m-0 text-[17px] font-semibold text-(--c-t-1b1b1b)">Archived</h2>
            <span className="text-[13px] text-(--c-t-9a9a9a)">Videos you dropped. The comments say why, so agents can learn from them.</span>
          </div>
          {archived.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-(--c-l-dcdcdc) py-12 text-center text-[13.5px] text-(--c-t-9a9a9a)">Nothing archived yet. Open a video and press the archive icon.</div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {archived.map((v) => (
                <Card key={v.id} v={v} dragging={false} onOpen={() => openVideo(v.id)} onDragStart={(e) => e.preventDefault()} onDragEnd={() => {}} />
              ))}
            </div>
          )}
        </div>
      )}

      {showArchive ? null : videos === undefined ? (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((c) => (
            <div key={c.value} className="h-[220px] animate-pulse rounded-2xl bg-(--c-b-ececea)" />
          ))}
        </div>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 pb-4 max-md:snap-x max-md:snap-mandatory">
          <div className="flex min-w-max items-start gap-4 md:grid md:min-w-0 md:grid-cols-3">
            {COLUMNS.map((col) => {
              const list = videos.filter((v) => v.status === col.value);
              const isOver = over === col.value && !!dragging;
              const posted = col.value === "posted";
              return (
                <section
                  key={col.value}
                  aria-label={col.label}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    if (over !== col.value) setOver(col.value);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === col.value ? null : o));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/x-edit") || dragging;
                    if (id) void update({ id: id as Id<"editVideos">, status: col.value });
                    setDragging(null);
                    setOver(null);
                  }}
                  className={`flex w-[300px] shrink-0 snap-start flex-col rounded-2xl p-3 transition-colors md:w-auto ${
                    isOver ? "bg-(--kb-drop) ring-2 ring-[#2358d8]/40" : posted ? "bg-(--kb-posted-bg) ring-1 ring-(--kb-posted-ring)" : "bg-(--c-b-efefed)"
                  }`}
                >
                  <header className="flex h-8 items-center gap-2 px-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                    <h2 className={`m-0 text-[13.5px] font-semibold ${posted ? "text-(--kb-posted-text)" : "text-(--c-t-1b1b1b)"}`}>{col.label}</h2>
                    <span className="text-[12.5px] tabular-nums text-(--c-t-9a9a9a)">{list.length}</span>
                  </header>
                  <div className="mt-1 flex min-h-[72px] flex-col gap-2">
                    {list.map((v) => (
                      <Card
                        key={v.id}
                        v={v}
                        dragging={dragging === v.id}
                        onOpen={() => openVideo(v.id)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/x-edit", v.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragging(v.id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                      />
                    ))}
                    {!list.length && (
                      <div className="flex h-[72px] items-center justify-center rounded-xl border border-dashed border-(--c-l-dcdcdc) px-4 text-center text-[12.5px] text-(--c-t-9a9a9a)">
                        {dragging ? "Drop here" : col.value === "editing" ? "New cuts from agents land here" : "Nothing here"}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {open && <VideoDetail id={open} onClose={() => openVideo(null)} />}
    </div>
  );
}

function Card({
  v,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  v: Row;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group flex w-full gap-3 rounded-xl bg-(--kb-card) p-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-(--kb-card-ring) transition-[box-shadow,transform,opacity] hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)] ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="relative h-[104px] w-[59px] shrink-0 overflow-hidden rounded-lg bg-[#111]">
        {v.videoUrl && <video src={`${v.videoUrl}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />}
        <span className="absolute left-1 top-1 rounded bg-black/65 px-1 text-[10.5px] font-semibold leading-[16px] text-white">v{v.version}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="line-clamp-2 text-[13.5px] font-medium leading-[1.35] text-(--c-t-1b1b1b)">{v.title}</div>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-(--c-t-8a8a8a)">
          {v.editsRequestedAt ? (
            <span className="rounded-full bg-(--c-b-fdf3cf) px-1.5 py-px text-[11px] font-medium text-(--c-t-7a5b00)">Edits requested</span>
          ) : null}
          {v.openComments > 0 && <span>{v.openComments} open comment{v.openComments === 1 ? "" : "s"}</span>}
          <span>{ago(v.updatedAt)}</span>
        </div>
      </div>
    </button>
  );
}

/** Upload a video file: a new video (v1), or the next version of one */
function UploadButton({ label, editId, onDone, small }: { label: string; editId?: Id<"editVideos">; onDone?: (id: string | null) => void; small?: boolean }) {
  const uploadUrl = useMutation(api.docs.generateUploadUrl);
  const create = useMutation(api.editFeed.create);
  const addVersion = useMutation(api.editFeed.addVersion);
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) return alert("Pick a video file");
    setProgress(0);
    try {
      const storageId = (await uploadToUrl(await uploadUrl(), file, setProgress)) as Id<"_storage">;
      if (editId) {
        await addVersion({ id: editId, storageId, mime: file.type });
        onDone?.(editId);
      } else {
        const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
        onDone?.(await create({ title, storageId, mime: file.type }));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  };
  return (
    <>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      <button
        type="button"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
        className={
          small
            ? "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-(--c-t-6b6b6b) ring-1 ring-(--c-l-e0e0dd) hover:text-(--c-t-1b1b1b) disabled:opacity-60"
            : "inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-60"
        }
      >
        <IconUpload size={14} color={small ? undefined : "var(--c-on-ink)"} />
        {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : label}
      </button>
    </>
  );
}

/** One video: the player with its versions, and the comments for the version you're watching */
function VideoDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useQuery(api.editFeed.get, { id });
  const update = useMutation(api.editFeed.update);
  const requestEdits = useMutation(api.editFeed.requestEdits);
  const cancelEdits = useMutation(api.editFeed.cancelEdits);
  const remove = useMutation(api.editFeed.remove);
  const [version, setVersion] = useState<number | null>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState<string | null>(null);
  /** The right side shows the transcript (follows the video) or the comments */
  const [tab, setTab] = useState<"transcript" | "comments">("transcript");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("textarea,input")) onClose();
    };
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Show the newest version, and jump to it when a new one arrives
  const latest = data?.version ?? 0;
  const lastSeen = useRef(0);
  useEffect(() => {
    if (latest && latest !== lastSeen.current) {
      lastSeen.current = latest;
      setVersion(latest);
    }
  }, [latest]);

  const shell = (children: ReactNode) =>
    createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Video"
        className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:p-6"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="flex w-full max-w-[1080px] flex-col overflow-hidden bg-(--c-b-ffffff) shadow-[0_24px_80px_rgba(0,0,0,0.3)] sm:rounded-2xl">{children}</div>
      </div>,
      document.body,
    );

  if (data === undefined) return shell(<div className="flex flex-1 items-center justify-center text-[14px] text-(--c-t-9a9a9a)">Loading…</div>);
  if (data === null)
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[14px] text-(--c-t-737373)">
        This video was deleted.
        <button type="button" onClick={onClose} className="font-medium text-(--c-t-2358d8)">
          Close
        </button>
      </div>,
    );

  const shown = data.versions.find((x) => x.number === version) ?? data.versions[data.versions.length - 1];
  const comments = data.comments.filter((c) => c.versionNumber === shown?.number).sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || a.createdAt - b.createdAt);
  const editId = data.id as Id<"editVideos">;

  return shell(
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-(--c-l-ebebeb) px-4">
        <input
          value={title ?? data.title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== null && title !== data.title) void update({ id: editId, title });
            setTitle(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Title"
          className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-2 text-[16px] font-semibold text-(--c-t-1b1b1b) outline-none hover:bg-(--c-b-f4f4f4) focus:bg-(--c-b-f4f4f4)"
        />
        <div className="hidden items-center rounded-lg bg-(--c-b-f4f4f2) p-0.5 sm:flex" role="radiogroup" aria-label="Status">
          {data.status === "archived" && <span className="px-2.5 text-[13px] font-medium text-(--c-t-737373)">Archived</span>}
          {data.status !== "archived" && COLUMNS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={data.status === c.value}
              onClick={() => void update({ id: editId, status: c.value })}
              className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] ${data.status === c.value ? "bg-(--c-b-ffffff) font-medium text-(--c-t-1b1b1b) shadow-sm" : "text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"}`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
              {c.label}
            </button>
          ))}
        </div>
        {data.status === "archived" ? (
          <button
            type="button"
            onClick={() => void update({ id: editId, status: "editing" })}
            title="Bring it back to Editing"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-(--c-t-6b6b6b) ring-1 ring-(--c-l-e3e3e0) hover:text-(--c-t-1b1b1b)"
          >
            <ArchiveIcon />
            Restore
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void update({ id: editId, status: "archived" });
              setTab("comments");
            }}
            aria-label="Archive"
            title="Archive: drop this video. Say why in a comment so agents can learn from it."
            className="flex h-9 w-9 items-center justify-center rounded-lg text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
          >
            <ArchiveIcon />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete "${data.title}" and all its versions? This can't be undone.`)) {
              void remove({ id: editId });
              onClose();
            }
          }}
          aria-label="Delete video"
          title="Delete video"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-b42318)"
        >
          <IconTrash size={16} />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
          <IconX />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* Player and versions */}
        <div className="flex shrink-0 flex-col items-center gap-3 bg-(--c-b-f7f7f5) p-4 md:w-[440px] md:overflow-y-auto">
          {shown?.url ? (
            <video
              key={shown.number}
              ref={player}
              src={shown.url}
              controls
              playsInline
              className="aspect-[9/16] max-h-[min(70vh,640px)] w-auto max-w-full rounded-xl bg-black shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
            />
          ) : (
            <div className="flex aspect-[9/16] h-[420px] items-center justify-center rounded-xl bg-(--c-b-ececea) text-[13px] text-(--c-t-9a9a9a)">No video file</div>
          )}
          <div className="flex w-full flex-wrap items-center justify-center gap-1.5" role="tablist" aria-label="Versions">
            {data.versions.map((x) => {
              const n = data.comments.filter((c) => c.versionNumber === x.number).length;
              const on = x.number === shown?.number;
              return (
                <button
                  key={x.number}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setVersion(x.number)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-1 ${
                    on ? "bg-(--c-b-1b1b1b) text-(--c-on-ink) ring-transparent" : "bg-(--c-b-ffffff) text-(--c-t-4a4a4a) ring-(--c-l-e3e3e0) hover:ring-(--c-l-c9c9c9)"
                  }`}
                >
                  v{x.number}
                  {x.number === data.version && <span className={`text-[11px] font-normal ${on ? "opacity-70" : "text-(--c-t-9a9a9a)"}`}>latest</span>}
                  {n > 0 && <span className={`text-[11px] font-normal ${on ? "opacity-70" : "text-(--c-t-9a9a9a)"}`}>· {n}</span>}
                </button>
              );
            })}
          </div>
          {shown && (
            <div className="w-full rounded-xl bg-(--c-b-ffffff) px-3.5 py-2.5 text-[13px] ring-1 ring-(--c-l-ebebeb)">
              <div className="text-[12px] text-(--c-t-9a9a9a)">
                v{shown.number} · {shown.by ?? "Someone"}
                {shown.agent && shown.by !== "Agent" ? " (agent)" : ""} · {ago(shown.createdAt)}
              </div>
              <div className={`mt-0.5 whitespace-pre-wrap ${shown.note ? "text-(--c-t-2e2e2e)" : "text-(--c-t-9a9a9a)"}`}>{shown.note || "No notes on this version."}</div>
            </div>
          )}
          <UploadButton label="Upload a new version" editId={editId} small />
        </div>

        {/* Comments */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--c-l-ebebeb) px-5 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-1" role="tablist" aria-label="Transcript or comments">
              {(["transcript", "comments"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium ${tab === t ? "bg-(--c-b-f1f1ef) text-(--c-t-1b1b1b)" : "text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"}`}
                >
                  {t === "transcript" ? "Transcript" : "Comments"}
                  {t === "comments" && comments.length > 0 && <span className="text-[12px] font-normal text-(--c-t-9a9a9a)">{comments.length}</span>}
                </button>
              ))}
              <span className="ml-1 text-[12.5px] text-(--c-t-9a9a9a)">v{shown?.number}{shown?.number === data.version ? "" : " (earlier)"}</span>
            </div>
            {data.status === "archived" ? (
              <span className="rounded-full bg-(--c-b-f1f1ef) px-2.5 py-1 text-[12.5px] text-(--c-t-6b6b6b)">Archived: say why in a comment so agents learn</span>
            ) : data.editsRequestedAt ? (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-(--c-b-fdf3cf) px-2.5 py-1 text-[12.5px] font-medium text-(--c-t-7a5b00)">Edits requested · {ago(data.editsRequestedAt)}</span>
                <button type="button" onClick={() => void cancelEdits({ id: editId })} className="text-[12.5px] text-(--c-t-737373) hover:text-(--c-t-1b1b1b)">
                  Undo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void requestEdits({ id: editId })}
                title="Tell the editor (an agent) to make the changes in these comments and upload the next version"
                className="inline-flex h-9 items-center rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[13.5px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333)"
              >
                Request edits
              </button>
            )}
          </div>
          {tab === "transcript" && shown ? (
            <Transcript
              key={shown.number}
              editId={editId}
              version={shown.number}
              versionId={shown.id}
              transcript={shown.transcript}
              comments={comments}
              seek={(t) => {
                const p = player.current;
                if (!p) return;
                p.currentTime = t;
                void p.play().catch(() => {});
              }}
            />
          ) : (
          <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {comments.length === 0 ? (
              <div className="py-8 text-center text-[13.5px] text-(--c-t-9a9a9a)">No comments on this version yet.</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {comments.map((c) => (
                  <CommentRow
                    key={c.id}
                    c={c}
                    onSeek={(t) => {
                      const p = player.current;
                      if (!p) return;
                      p.currentTime = t;
                      void p.play().catch(() => {});
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          {shown && <Composer editId={editId} version={shown.number} player={player} />}
          </>
          )}
        </div>
      </div>
    </>,
  );
}

type Attachment = { url: string | null; mime: string | null; name: string | null };
type CommentData = {
  id: string;
  text: string;
  at: number | null;
  end: number | null;
  quote: string | null;
  attachments: Attachment[];
  authorName: string | null;
  agent: boolean;
  resolved: boolean;
  createdAt: number;
};

/** Images and videos on a comment, shown like in script comments: pictures as thumbnails, videos playable */
function AttachmentGrid({ items }: { items: Attachment[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a, i) =>
        !a.url ? null : a.mime?.startsWith("video/") ? (
          <video key={i} src={a.url} controls playsInline preload="metadata" className="max-h-[220px] max-w-full rounded-lg bg-black" />
        ) : a.mime?.startsWith("image/") || !a.mime ? (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.name ?? ""} className="max-h-[160px] max-w-[240px] rounded-lg object-cover ring-1 ring-(--c-l-ebebeb)" />
          </a>
        ) : (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-(--c-t-2358d8) ring-1 ring-(--c-l-ebebeb)">
            {a.name ?? "File"}
          </a>
        ),
      )}
    </div>
  );
}

function CommentRow({ c, onSeek }: { c: CommentData; onSeek: (t: number) => void }) {
  const updateComment = useMutation(api.editFeed.updateComment);
  const removeComment = useMutation(api.editFeed.removeComment);
  return (
    <div className={`group rounded-xl px-3.5 py-2.5 ring-1 ring-(--c-l-ebebeb) ${c.resolved ? "bg-(--c-b-fafaf9)" : "bg-(--c-b-ffffff)"}`}>
      <div className="flex items-center gap-2 text-[12px] text-(--c-t-9a9a9a)">
        {c.at !== null && (
          <button type="button" onClick={() => onSeek(c.at!)} title="Play from here" className="rounded-md bg-(--c-b-e7eefb) px-1.5 py-px font-medium tabular-nums text-(--c-t-2358d8) hover:bg-(--c-b-dbe6fb)">
            {clock(c.at)}
            {c.end !== null && c.end > c.at + 0.5 ? `–${clock(c.end)}` : ""}
          </button>
        )}
        <span className="font-medium text-(--c-t-4a4a4a)">{c.authorName ?? "Someone"}</span>
        {c.agent && <span className="rounded bg-(--c-b-efe9fb) px-1 text-[11px] font-medium text-(--c-t-5b3fb0)">Agent</span>}
        <span>{ago(c.createdAt)}</span>
        <span className="flex-1" />
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={c.resolved} onChange={() => void updateComment({ id: c.id as Id<"editComments">, resolved: !c.resolved })} className="nn-check h-[14px] w-[14px]" />
          {c.resolved ? "Done" : "Mark done"}
        </label>
        <button
          type="button"
          onClick={() => confirm("Delete this comment?") && void removeComment({ id: c.id as Id<"editComments"> })}
          aria-label="Delete comment"
          className="flex h-6 w-6 items-center justify-center rounded text-(--c-t-9a9a9a) opacity-0 hover:text-(--c-t-b42318) group-hover:opacity-100 pointer-coarse:opacity-100"
        >
          <IconTrash size={13} />
        </button>
      </div>
      {c.quote && (
        <button type="button" onClick={() => c.at !== null && onSeek(c.at)} className="mt-1.5 block w-full border-l-2 border-(--comment-underline) pl-2.5 text-left text-[13px] italic leading-[1.5] text-(--c-t-737373)">
          “{c.quote}”
        </button>
      )}
      {c.text && (
        <div className={`mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.55] ${c.resolved ? "text-(--c-t-9a9a9a) line-through decoration-(--c-t-c4c4c4)" : "text-(--c-t-262626)"}`}>{c.text}</div>
      )}
      <AttachmentGrid items={c.attachments} />
    </div>
  );
}

type Pending = { key: string; name: string; mime: string; preview: string; progress: number; storageId?: Id<"_storage">; error?: string };

/** Pasted, dropped or picked images and videos, uploaded straight away so posting is instant */
function useUploads() {
  const uploadUrl = useMutation(api.docs.generateUploadUrl);
  const [files, setFiles] = useState<Pending[]>([]);
  const add = (list: File[]) => {
    for (const f of list.filter((x) => /^(image|video)\//.test(x.type))) {
      const key = Math.random().toString(36).slice(2);
      setFiles((p) => [...p, { key, name: f.name, mime: f.type, preview: URL.createObjectURL(f), progress: 0 }]);
      void (async () => {
        try {
          const id = (await uploadToUrl(await uploadUrl(), f, (pr) => setFiles((p) => p.map((x) => (x.key === key ? { ...x, progress: pr } : x))))) as Id<"_storage">;
          setFiles((p) => p.map((x) => (x.key === key ? { ...x, storageId: id, progress: 1 } : x)));
        } catch {
          setFiles((p) => p.map((x) => (x.key === key ? { ...x, error: "Upload failed" } : x)));
        }
      })();
    }
  };
  const remove = (key: string) => setFiles((p) => p.filter((x) => x.key !== key));
  const ready = files.filter((f) => f.storageId).map((f) => ({ storageId: f.storageId!, mime: f.mime, name: f.name }));
  const busy = files.some((f) => !f.storageId && !f.error);
  return { files, add, remove, ready, busy, clear: () => setFiles([]) };
}

function PendingStrip({ up }: { up: ReturnType<typeof useUploads> }) {
  if (!up.files.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2.5">
      {up.files.map((f) => (
        <div key={f.key} className="relative h-14 w-14 overflow-hidden rounded-lg bg-(--c-b-ececea) ring-1 ring-(--c-l-ebebeb)">
          {f.mime.startsWith("video/") ? <video src={f.preview} muted className="h-full w-full object-cover" /> : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.preview} alt="" className="h-full w-full object-cover" />
          )}
          {!f.storageId && !f.error && <div className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded bg-black/30"><div className="h-full bg-white" style={{ width: `${Math.round(f.progress * 100)}%` }} /></div>}
          {f.error && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] text-white">Failed</div>}
          <button type="button" onClick={() => up.remove(f.key)} aria-label="Remove" className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white">
            <IconX size={9} color="#fff" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AttachButton({ up }: { up: ReturnType<typeof useUploads> }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { up.add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} title="Add images or videos (or paste them)" aria-label="Add images or videos" className="flex h-7 w-7 items-center justify-center rounded-md text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13.5 7.5 8 13a3.2 3.2 0 0 1-4.6-4.6l5.8-5.8a2.1 2.1 0 0 1 3 3L6.5 11.3a1.1 1.1 0 0 1-1.6-1.5L10 4.7" />
        </svg>
      </button>
    </>
  );
}

/** Write a comment; it's pinned to where the video is when you start typing (switch that off for a general note) */
function Composer({ editId, version, player }: { editId: Id<"editVideos">; version: number; player: React.RefObject<HTMLVideoElement | null> }) {
  const add = useMutation(api.editFeed.addComment);
  const up = useUploads();
  const [text, setText] = useState("");
  const [atOn, setAtOn] = useState(true);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  // Follow the player while the box is empty, so the time is where you paused
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const tick = () => !text && setAt(p.currentTime);
    p.addEventListener("timeupdate", tick);
    p.addEventListener("seeked", tick);
    return () => {
      p.removeEventListener("timeupdate", tick);
      p.removeEventListener("seeked", tick);
    };
  }, [player, text, version]);
  const send = async () => {
    const t = text.trim();
    if ((!t && !up.ready.length) || busy || up.busy) return;
    setBusy(true);
    try {
      await add({ id: editId, versionNumber: version, text: t, at: atOn ? Math.round(at * 10) / 10 : null, attachments: up.ready });
      setText("");
      up.clear();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="shrink-0 border-t border-(--c-l-ebebeb) p-4">
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDrag(true);
          }
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDrag(false);
          up.add(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-xl bg-(--c-b-ffffff) ring-1 ${drag ? "ring-2 ring-(--c-l-2358d8)" : "ring-(--c-l-e3e3e0) focus-within:ring-(--c-l-c9c9c9)"}`}
      >
        <PendingStrip up={up} />
        <textarea
          value={text}
          rows={2}
          onFocus={() => player.current?.pause()}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => /^(image|video)\//.test(f.type));
            if (files.length) {
              e.preventDefault();
              up.add(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="What should change? Paste images or videos too (⌘↵ to post)"
          aria-label="Comment"
          className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[14px] leading-[1.5] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <button
            type="button"
            onClick={() => setAtOn(!atOn)}
            aria-pressed={atOn}
            title={atOn ? "Pinned to this moment in the video. Click for a general comment." : "A general comment. Click to pin it to the current moment."}
            className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] tabular-nums ${atOn ? "bg-(--c-b-e7eefb) font-medium text-(--c-t-2358d8)" : "text-(--c-t-9a9a9a) ring-1 ring-(--c-l-e3e3e0)"}`}
          >
            {atOn ? `at ${clock(at)}` : "No time"}
          </button>
          <AttachButton up={up} />
          <span className="flex-1" />
          <button
            type="button"
            disabled={(!text.trim() && !up.ready.length) || busy || up.busy}
            onClick={() => void send()}
            className="h-8 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[13px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-40"
          >
            {up.busy ? "Uploading…" : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

type Word = { w: string; s: number; e: number };
type TranscriptData = { status: "working" | "done" | "failed" | "unavailable"; words: Word[]; error?: string } | null;

/** Words in short lines: a new line after a pause, or at a sentence end once the line is long enough */
function lines(words: Word[]) {
  const out: { start: number; words: { w: Word; i: number }[] }[] = [];
  words.forEach((w, i) => {
    const cur = out[out.length - 1];
    const prev = cur?.words[cur.words.length - 1]?.w;
    if (!cur || (prev && (w.s - prev.e > 1 || (/[.!?]$/.test(prev.w) && cur.words.length >= 8) || cur.words.length >= 30))) out.push({ start: w.s, words: [{ w, i }] });
    else cur.words.push({ w, i });
  });
  return out;
}

/**
 * The version's transcript. Select any words to comment on just that part (the comment keeps the quote and
 * its moment in the video); parts with comments are highlighted. Click a word to play from there.
 */
function Transcript({
  editId,
  version,
  versionId,
  transcript,
  comments,
  seek,
}: {
  editId: Id<"editVideos">;
  version: number;
  versionId: string;
  transcript: TranscriptData;
  comments: CommentData[];
  seek: (t: number) => void;
}) {
  const retry = useMutation(api.editFeed.retranscribe);
  const add = useMutation(api.editFeed.addComment);
  const words = useMemo(() => (transcript?.status === "done" ? transcript.words : []), [transcript]);
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ from: number; to: number; top: number; left: number } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const up = useUploads();

  // Words that already have a comment on them
  const commented = useMemo(() => {
    const set = new Set<number>();
    for (const c of comments) {
      if (c.at === null || c.end === null || !c.quote) continue;
      words.forEach((w, i) => w.s >= c.at! - 0.01 && w.e <= c.end! + 0.01 && set.add(i));
    }
    return set;
  }, [comments, words]);

  const pick = () => {
    const s = window.getSelection();
    const b = box.current;
    if (!s || s.isCollapsed || !b || !b.contains(s.anchorNode) || !b.contains(s.focusNode)) return;
    // Which word a selection end is in; one in the space after word i snaps to the next word (start) or to i (end)
    const idx = (n: Node | null, isStart: boolean) => {
      const el = n?.nodeType === 1 ? (n as Element) : n?.parentElement;
      const w = el?.closest("[data-w]") as HTMLElement | null;
      if (w) return Number(w.dataset.w);
      const g = el?.closest("[data-g]") as HTMLElement | null;
      if (!g) return null;
      const i = Number(g.dataset.g);
      return isStart ? Math.min(i + 1, words.length - 1) : i;
    };
    const r = s.getRangeAt(0);
    const a = idx(r.startContainer, true);
    const z = idx(r.endContainer, false);
    if (a === null || z === null) return;
    const rect = r.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    setSel({ from: Math.min(a, z), to: Math.max(a, z), top: rect.bottom - br.top + b.scrollTop + 8, left: Math.max(8, Math.min(rect.left - br.left, br.width - 330)) });
    setText("");
  };

  const post = async () => {
    if (!sel || busy || up.busy || (!text.trim() && !up.ready.length)) return;
    setBusy(true);
    try {
      const ws = words.slice(sel.from, sel.to + 1);
      await add({ id: editId, versionNumber: version, text: text.trim(), at: ws[0].s, end: ws[ws.length - 1].e, quote: ws.map((w) => w.w).join(" "), attachments: up.ready });
      setSel(null);
      setText("");
      up.clear();
      window.getSelection()?.removeAllRanges();
    } finally {
      setBusy(false);
    }
  };

  if (!transcript || transcript.status !== "done") {
    const msg =
      !transcript
        ? "This version was added before transcripts existed."
        : transcript.status === "working"
          ? "Transcribing…"
          : transcript.status === "unavailable"
            ? "Transcripts aren't switched on yet: a speech-to-text key needs adding to Native Note."
            : `Couldn't transcribe this version${transcript.error ? `: ${transcript.error}` : "."}`;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-[13.5px] text-(--c-t-8a8a8a)">
        {transcript?.status === "working" && <span className="h-2 w-2 animate-pulse rounded-full bg-(--c-b-2358d8)" />}
        <p className="m-0 max-w-[340px]">{msg}</p>
        {transcript?.status !== "working" && (
          <button type="button" onClick={() => void retry({ versionId: versionId as Id<"editVersions"> })} className="h-8 rounded-lg px-3 text-[13px] font-medium text-(--c-t-2358d8) ring-1 ring-(--c-l-e3e3e0) hover:bg-(--c-b-f4f4f4)">
            {transcript ? "Try again" : "Transcribe"}
          </button>
        )}
      </div>
    );
  }
  if (!words.length) return <div className="flex flex-1 items-center justify-center text-[13.5px] text-(--c-t-9a9a9a)">No speech in this version.</div>;

  return (
    <div ref={box} onMouseUp={() => setTimeout(pick, 0)} className="relative min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <p className="m-0 mb-3 text-[12.5px] text-(--c-t-9a9a9a)">Select words to comment on that part.</p>
      {lines(words).map((l) => (
        <p key={l.start} className="m-0 mb-3.5 flex gap-3 text-[15.5px] leading-[1.75]">
          <button type="button" onClick={() => seek(l.start)} className="mt-[5px] h-5 shrink-0 select-none rounded px-1 text-[11.5px] tabular-nums text-(--c-t-b0b0b0) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-2358d8)">
            {clock(l.start)}
          </button>
          <span className="min-w-0 text-(--c-t-262626)">
            {l.words.map(({ w, i }) => (
              <span key={i} data-g={i}>
                <span
                  data-w={i}
                  onClick={() => !window.getSelection()?.toString() && seek(w.s)}
                  className={`cursor-text rounded-[3px] ${
                    sel && i >= sel.from && i <= sel.to ? "bg-(--selection)" : commented.has(i) ? "bg-(--comment-highlight) shadow-[0_2px_0_var(--comment-underline)]" : "hover:bg-(--c-b-f4f4f4)"
                  }`}
                >
                  {w.w}
                </span>{" "}
              </span>
            ))}
          </span>
        </p>
      ))}
      {sel && (
        <div
          style={{ top: sel.top, left: sel.left }}
          onMouseUp={(e) => e.stopPropagation()}
          className="absolute z-10 w-[320px] rounded-xl bg-(--c-b-ffffff) p-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.14)] ring-1 ring-(--c-l-ebebeb)"
        >
          <div className="mb-1.5 line-clamp-2 border-l-2 border-(--comment-underline) pl-2 text-[12.5px] italic text-(--c-t-737373)">
            “{words.slice(sel.from, sel.to + 1).map((w) => w.w).join(" ")}”
          </div>
          <PendingStrip up={up} />
          <textarea
            autoFocus
            value={text}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => /^(image|video)\//.test(f.type));
              if (files.length) {
                e.preventDefault();
                up.add(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void post();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setSel(null);
              }
            }}
            placeholder="Comment on this part…"
            className="mt-1 block w-full resize-none rounded-lg bg-(--c-b-fafaf9) px-2.5 py-2 text-[13.5px] leading-[1.5] text-(--c-t-1b1b1b) outline-none ring-1 ring-(--c-l-ebebeb) focus:ring-(--c-l-c9c9c9)"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <AttachButton up={up} />
            <span className="flex-1" />
            <button type="button" onClick={() => setSel(null)} className="h-7 rounded-md px-2.5 text-[12.5px] text-(--c-t-737373) hover:bg-(--c-b-f4f4f4)">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || up.busy || (!text.trim() && !up.ready.length)}
              onClick={() => void post()}
              className="h-7 rounded-md bg-(--c-b-1b1b1b) px-3 text-[12.5px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-40"
            >
              {up.busy ? "Uploading…" : "Comment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="3.25" rx="1" />
      <path d="M3 6v6.25a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6M6.5 8.75h3" />
    </svg>
  );
}
