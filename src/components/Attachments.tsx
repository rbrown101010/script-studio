"use client";

import { useEffect, useState } from "react";
import type { Attachment } from "@/lib/types";
import { formatBytes, hostOf, normalizeUrl } from "@/lib/util";
import { LinkCard, hasLinkCard } from "./LinkCard";
import { IconAudio, IconDownload, IconFile, IconLink, IconPlay, IconVideo, IconX } from "./icons";

const KIND_LABEL: Record<Attachment["kind"], string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  file: "File",
  link: "Link",
};

/** Downloads a file in one click (fetches it so cross-site files save instead of opening). */
export async function downloadFile(url: string, name?: string | null) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name || url.split("/").pop()?.split("?")[0] || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const isMedia = (a: Attachment) => a.kind === "image" || a.kind === "video" || a.kind === "audio" || a.kind === "file";

/**
 * Files and links under a comment, kept small so long threads stay readable: files are compact tiles
 * (click to view or play full screen, with download), links are one-line cards.
 */
export function AttachmentList({
  attachments,
  editable,
  onRemove,
  isNew,
  showDownload = true,
}: {
  attachments: Attachment[];
  editable?: boolean;
  onRemove?: (attId: string) => void;
  /** Kept for callers; the viewer is built in */
  onOpenImage?: (url: string) => void;
  isNew?: (a: Attachment) => boolean;
  /** A one-click download button on every file (on by default) */
  showDownload?: boolean;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const uploads = attachments.filter((a) => a.progress !== undefined);
  const files = attachments.filter((a) => a.progress === undefined && isMedia(a) && a.url);
  const links = attachments.filter((a) => a.progress === undefined && a.kind === "link");
  const ring = (a: Attachment) => (isNew?.(a) ? "ring-2 ring-red-500 ring-offset-1" : "");
  if (!attachments.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((a, i) => (
            <div
              key={a.id}
              // Photos and videos show whole (their own shape) in a framed card; other files stay small squares
              className={`group/item relative ${
                a.kind === "image" || a.kind === "video"
                  ? "max-w-full rounded-xl border border-(--c-l-e3e3e0) bg-(--c-b-ffffff) p-1 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  : "h-[72px] w-[72px] overflow-hidden rounded-lg bg-(--c-b-f1efe9)"
              } ${ring(a)}`}
            >
              <button type="button" className="block h-full w-full max-w-full" onClick={() => setViewing(i)} aria-label={`Open ${a.name ?? KIND_LABEL[a.kind].toLowerCase()}`} title={a.name ?? undefined}>
                <Thumb a={a} />
              </button>
              {editable && <RemoveButton onClick={() => onRemove?.(a.id)} overlay label={a.name} />}
              {showDownload && (
                <button
                  type="button"
                  aria-label={`Download ${a.name ?? "file"}`}
                  title="Download"
                  onClick={() => a.url && void downloadFile(a.url, a.name)}
                  className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-(--c-b-ffffff)/95 text-(--c-t-1b1b1b) shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:bg-(--c-b-ffffff)"
                >
                  <IconDownload size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {links.map((a) => (
        <div key={a.id} className={`group/item relative rounded-lg ${ring(a)}`}>
          <Item a={a} />
          {editable && <RemoveButton onClick={() => onRemove?.(a.id)} label={a.name} />}
        </div>
      ))}
      {uploads.map((a) => (
        <div key={a.id} className="group/item relative">
          <UploadRow a={a} />
          {editable && <RemoveButton onClick={() => onRemove?.(a.id)} label={a.name} />}
        </div>
      ))}
      {viewing !== null && files[viewing] && <MediaViewer items={files} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** The small square preview of a file. */
function Thumb({ a }: { a: Attachment }) {
  if (a.kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.url ?? ""} alt={a.name ?? ""} loading="lazy" className="block h-[144px] w-auto max-w-full rounded-lg object-contain" />;
  if (a.kind === "video")
    return (
      <span className="relative flex items-center justify-center overflow-hidden rounded-lg bg-[#1b1b1b]">
        <video src={`${a.url ?? ""}#t=0.1`} preload="metadata" muted playsInline className="block h-[144px] w-auto min-w-[80px] max-w-full object-contain" />
        <span className="absolute flex h-7 w-7 items-center justify-center rounded-full bg-(--c-b-ffffff)/95 text-(--c-t-1b1b1b)">
          <IconPlay size={12} />
        </span>
      </span>
    );
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-(--c-t-6b6b6b)">
      {a.kind === "audio" ? <IconAudio size={20} /> : <IconFile size={20} />}
      <span className="w-full truncate text-center text-[10px] leading-tight">{a.name ?? KIND_LABEL[a.kind]}</span>
    </span>
  );
}

/** Full-screen view of a comment's files: images, videos and audio play here; arrows move between them. */
export function MediaViewer({ items, index, onIndex, onClose }: { items: Attachment[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const a = items[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      // Handled here only: Esc shouldn't also close what's behind the viewer
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [index, items.length, onClose, onIndex]);
  if (!a) return null;
  const nav = "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20";
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-(--c-b-0b0b0b)/[0.96]" onClick={onClose} role="dialog" aria-label={a.name ?? "Attachment"}>
      <div className="flex items-center gap-3 px-4 py-3 text-white sm:px-6" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{a.name ?? KIND_LABEL[a.kind]}</div>
          <div className="text-[12px] text-white/60">
            {KIND_LABEL[a.kind]}
            {a.size ? ` · ${formatBytes(a.size)}` : ""}
            {items.length > 1 ? ` · ${index + 1} of ${items.length}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => a.url && void downloadFile(a.url, a.name)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-(--c-b-ffffff) px-3.5 text-[13px] font-medium text-(--c-t-1b1b1b) hover:bg-(--c-b-ffffff)/90"
        >
          <IconDownload size={14} />
          Download
        </button>
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15">
          <IconX size={16} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-16" onClick={onClose}>
        <div className="flex max-h-full max-w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {a.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.url ?? ""} alt={a.name ?? ""} className="max-h-[calc(100vh-110px)] max-w-full rounded-lg object-contain" />
          ) : a.kind === "video" ? (
            <video key={a.id} src={a.url ?? ""} controls autoPlay playsInline className="max-h-[calc(100vh-110px)] max-w-full rounded-lg bg-black" />
          ) : a.kind === "audio" ? (
            <audio key={a.id} src={a.url ?? ""} controls autoPlay className="w-[min(480px,90vw)]" />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/10 px-10 py-8 text-white">
              <IconFile size={40} />
              <div className="max-w-[60vw] truncate text-[15px]">{a.name}</div>
              <div className="text-[13px] text-white/60">No preview for this file. Download it to open.</div>
            </div>
          )}
        </div>
        {index > 0 && (
          <button type="button" aria-label="Previous" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} className={`${nav} left-3`}>
            <span className="inline-flex rotate-180"><Chevron /></span>
          </button>
        )}
        {index < items.length - 1 && (
          <button type="button" aria-label="Next" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} className={`${nav} right-3`}>
            <Chevron />
          </button>
        )}
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--c-b-f4f4f4) text-(--c-t-6b6b6b)">{children}</div>
  );
}

function Item({ a }: { a: Attachment }) {
  if (a.url && hasLinkCard(a.url)) return <LinkCard url={a.url} compact />;
  return (
    <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg border border-(--c-l-ebebeb) px-2.5 py-2 text-inherit no-underline hover:bg-(--c-b-fafafa)">
      <Tile>
        <IconLink size={16} />
      </Tile>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-(--c-t-1b1b1b)">{a.name || hostOf(a.url)}</div>
        <div className="truncate text-[12px] text-(--c-t-2358d8)">{(a.url ?? "").replace(/^https?:\/\/(www\.)?/, "")}</div>
      </div>
    </a>
  );
}

function UploadRow({ a }: { a: Attachment }) {
  const icon = a.kind === "video" ? <IconVideo size={18} /> : a.kind === "audio" ? <IconAudio size={18} /> : <IconFile size={18} />;
  const sent = (a.size ?? 0) * (a.progress ?? 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <Tile>{icon}</Tile>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-(--c-t-1b1b1b)">{a.name}</div>
          <div className={`text-[12px] ${a.error ? "text-red-600" : "text-(--c-t-737373)"}`}>
            {a.error ? a.error : `Uploading · ${formatBytes(sent)} of ${formatBytes(a.size)}`}
          </div>
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-(--c-b-eeeeee)">
        <div
          className={`h-1 transition-[width] ${a.error ? "bg-red-400" : "bg-(--c-b-2358d8)"}`}
          style={{ width: `${Math.max(2, (a.progress ?? 0) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function RemoveButton({ onClick, overlay, label }: { onClick: () => void; overlay?: boolean; label?: string | null }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`Remove ${label ?? "attachment"}`}
      className={`absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full group-hover/item:flex pointer-coarse:flex ${
        overlay ? "bg-black/60 text-white hover:bg-black/80" : "bg-(--c-b-ffffff) text-(--c-t-6b6b6b) shadow hover:text-(--c-t-1b1b1b)"
      }`}
    >
      <IconX size={13} />
    </button>
  );
}

export function LinkInput({ onAdd, onClose }: { onAdd: (url: string) => void; onClose: () => void }) {
  const [link, setLink] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => {
    const url = normalizeUrl(link);
    if (!url) return setErr(true);
    onAdd(url);
    setLink("");
    onClose();
  };
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={link}
        onChange={(e) => {
          setLink(e.target.value);
          setErr(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onClose();
        }}
        placeholder="Paste a link"
        aria-label="Link"
        className={`h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[13px] text-(--c-t-1b1b1b) outline-none focus:border-(--c-l-8a8a8a) ${
          err ? "border-red-400" : "border-(--c-l-dcdcdc)"
        }`}
      />
      <button type="button" onClick={submit} className="h-9 rounded-lg bg-(--c-b-1b1b1b) px-3 text-[13px] font-medium text-(--c-on-ink)">
        Add
      </button>
    </div>
  );
}

export function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--c-b-ffffff)/95 p-8" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="max-h-full max-w-full rounded-lg shadow-lg" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute right-6 top-5 text-[13px] text-(--c-t-6b6b6b) hover:text-(--c-t-1b1b1b)"
      >
        Open original
      </a>
    </div>
  );
}

