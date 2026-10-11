"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { uploadToUrl } from "@/lib/upload";
import { IconTrash, IconUpload, IconX } from "./icons";

type Status = "editing" | "ready" | "posted";
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
        <UploadButton label="Upload video" onDone={(id) => id && openVideo(id)} />
      </div>

      {videos === undefined ? (
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
          {COLUMNS.map((c) => (
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
            {data.editsRequestedAt ? (
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
              versionId={shown.id}
              transcript={shown.transcript}
              player={player}
              seek={(t) => {
                const p = player.current;
                if (!p) return;
                p.currentTime = t;
                void p.play().catch(() => {});
              }}
              onComment={() => setTab("comments")}
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

type CommentData = { id: string; text: string; at: number | null; authorName: string | null; agent: boolean; resolved: boolean; createdAt: number };

function CommentRow({ c, onSeek }: { c: CommentData; onSeek: (t: number) => void }) {
  const updateComment = useMutation(api.editFeed.updateComment);
  const removeComment = useMutation(api.editFeed.removeComment);
  return (
    <div className={`group rounded-xl px-3.5 py-2.5 ring-1 ring-(--c-l-ebebeb) ${c.resolved ? "bg-(--c-b-fafaf9)" : "bg-(--c-b-ffffff)"}`}>
      <div className="flex items-center gap-2 text-[12px] text-(--c-t-9a9a9a)">
        {c.at !== null && (
          <button type="button" onClick={() => onSeek(c.at!)} title="Play from here" className="rounded-md bg-(--c-b-e7eefb) px-1.5 py-px font-medium tabular-nums text-(--c-t-2358d8) hover:bg-(--c-b-dbe6fb)">
            {clock(c.at)}
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
      <div className={`mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.55] ${c.resolved ? "text-(--c-t-9a9a9a) line-through decoration-(--c-t-c4c4c4)" : "text-(--c-t-262626)"}`}>{c.text}</div>
    </div>
  );
}

/** Write a comment; it's pinned to where the video is when you start typing (switch that off for a general note) */
function Composer({ editId, version, player }: { editId: Id<"editVideos">; version: number; player: React.RefObject<HTMLVideoElement | null> }) {
  const add = useMutation(api.editFeed.addComment);
  const [text, setText] = useState("");
  const [atOn, setAtOn] = useState(true);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
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
    if (!t || busy) return;
    setBusy(true);
    try {
      await add({ id: editId, versionNumber: version, text: t, at: atOn ? Math.round(at * 10) / 10 : null });
      setText("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="shrink-0 border-t border-(--c-l-ebebeb) p-4">
      <div className="rounded-xl bg-(--c-b-ffffff) ring-1 ring-(--c-l-e3e3e0) focus-within:ring-(--c-l-c9c9c9)">
        <textarea
          value={text}
          rows={2}
          onFocus={() => player.current?.pause()}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="What should change? (⌘↵ to post)"
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
          <span className="flex-1" />
          <button
            type="button"
            disabled={!text.trim() || busy}
            onClick={() => void send()}
            className="h-8 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[13px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-40"
          >
            Comment
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
 * The version's transcript, like Descript: the word being said lights up and the text scrolls along as the
 * video plays. Click any word to jump there.
 */
function Transcript({
  versionId,
  transcript,
  player,
  seek,
  onComment,
}: {
  versionId: string;
  transcript: TranscriptData;
  player: React.RefObject<HTMLVideoElement | null>;
  seek: (t: number) => void;
  onComment: () => void;
}) {
  const retry = useMutation(api.editFeed.retranscribe);
  const words = useMemo(() => (transcript?.status === "done" ? transcript.words : []), [transcript]);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(0);

  // Follow the video smoothly (every frame while it plays, not just on the coarse timeupdate event)
  useEffect(() => {
    if (!words.length) return;
    let raf = 0;
    let last = -2;
    const find = (t: number) => {
      let lo = 0;
      let hi = words.length - 1;
      let hit = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (words[mid].s <= t) {
          hit = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return hit;
    };
    const tick = () => {
      const p = player.current;
      if (p) {
        const i = find(p.currentTime + 0.05);
        if (i !== last) {
          last = i;
          setActive(i);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [words, player]);

  // Keep the current word in view, unless you've just scrolled the transcript yourself
  useEffect(() => {
    if (active < 0 || Date.now() - userScrolled.current < 2500) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-w="${active}"]`);
    const b = box.current;
    if (!el || !b) return;
    const r = el.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    if (r.top < br.top + 40 || r.bottom > br.bottom - 60) b.scrollTo({ top: b.scrollTop + (r.top - br.top) - br.height / 3, behavior: "smooth" });
  }, [active]);

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
    <div
      ref={box}
      onWheel={() => (userScrolled.current = Date.now())}
      onTouchMove={() => (userScrolled.current = Date.now())}
      className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
    >
      {lines(words).map((l) => (
        <p key={l.start} className="m-0 mb-3.5 flex gap-3 text-[15.5px] leading-[1.75]">
          <button type="button" onClick={() => seek(l.start)} className="mt-[5px] h-5 shrink-0 rounded px-1 text-[11.5px] tabular-nums text-(--c-t-b0b0b0) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-2358d8)">
            {clock(l.start)}
          </button>
          <span className="min-w-0">
            {l.words.map(({ w, i }) => (
              <span key={i}>
                <span
                  data-w={i}
                  onClick={() => seek(w.s)}
                  className={`cursor-pointer rounded-[4px] px-[1px] transition-colors duration-100 ${
                    i === active ? "bg-(--c-b-dbe6fb) text-(--c-t-163b99)" : i < active ? "text-(--c-t-1b1b1b)" : "text-(--c-t-8a8a8a) hover:text-(--c-t-1b1b1b)"
                  }`}
                >
                  {w.w}
                </span>{" "}
              </span>
            ))}
          </span>
        </p>
      ))}
      <div className="sticky bottom-0 flex justify-center pt-2">
        <button type="button" onClick={onComment} className="h-8 rounded-full bg-(--c-b-1b1b1b) px-3.5 text-[12.5px] font-medium text-(--c-on-ink) shadow-sm hover:bg-(--c-b-333333)">
          Comment at this moment
        </button>
      </div>
    </div>
  );
}
