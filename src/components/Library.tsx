"use client";

import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { LibraryAsset } from "../../convex/library";
import { downloadFile } from "./Attachments";
import { IconAudio, IconDownload, IconFile, IconPlay, IconSearch, IconX } from "./icons";

const PAGE = 40;

/**
 * Library: every file pasted into a comment, as a grid. Loads a page at a time as you scroll; search looks
 * through names, the line each file was commented on, the script and the comment (server-side, indexed).
 */
export function Library() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState<LibraryAsset | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { results, status, loadMore } = usePaginatedQuery(api.library.list, debounced ? { search: debounced } : {}, { initialNumItems: PAGE });
  const assets = results as LibraryAsset[];

  // Load the next page when the bottom of the grid comes into view
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "CanLoadMore") return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-[640px]">
        <label className="flex h-12 items-center gap-3 rounded-full bg-(--c-b-ffffff) px-5 text-(--c-t-8a8a8a) shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-(--c-l-e3e3e0) focus-within:ring-(--c-l-c9c9c6)">
          <IconSearch />
          <input
            id="library-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, line or script…"
            aria-label="Search the library"
            className="w-full border-none bg-transparent text-[16px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
          />
        </label>
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-(--c-b-ececea)" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <p className="mt-16 text-center text-[14px] text-(--c-t-8a8a8a)">
          {debounced ? "Nothing matches." : "Files you paste into comments will show up here."}
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpen(a)}
              className="group flex flex-col gap-2 rounded-xl text-left"
              aria-label={`${a.name}, more details`}
            >
              <span className="relative block aspect-square overflow-hidden rounded-xl bg-(--c-b-ffffff) ring-1 ring-(--c-l-e3e3e0) transition-shadow group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
                <Preview a={a} />
              </span>
              <span className="truncate px-0.5 text-[13px] text-(--c-t-4a4a4a)">{a.name}</span>
            </button>
          ))}
        </div>
      )}
      <div ref={sentinel} className="h-px" />
      {status === "LoadingMore" && <p className="mt-6 text-center text-[13px] text-(--c-t-9a9a9a)">Loading more…</p>}

      {open && <Details a={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Preview({ a }: { a: LibraryAsset }) {
  if (a.kind === "image" && a.url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.url} alt="" loading="lazy" className="h-full w-full object-cover" />;
  if (a.kind === "video" && a.url)
    return (
      <span className="relative flex h-full w-full items-center justify-center bg-[#1b1b1b]">
        <video src={`${a.url}#t=0.1`} preload="metadata" muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-(--c-b-ffffff)/95 text-(--c-t-1b1b1b)">
          <IconPlay size={14} />
        </span>
      </span>
    );
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-(--c-t-8a8a8a)">
      {a.kind === "audio" ? <IconAudio size={28} /> : <IconFile size={28} />}
      <span className="w-full truncate text-center text-[12px]">{extOf(a.name)}</span>
    </span>
  );
}

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase() : "FILE");
const sizeOf = (n: number | null) => (n === null ? null : n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} KB` : `${(n / 1e6).toFixed(1)} MB`);

/** More details: the big preview plus where it came from. */
function Details({ a, onClose }: { a: LibraryAsset; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const facts = [a.kind[0].toUpperCase() + a.kind.slice(1), sizeOf(a.size), new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })].filter(Boolean);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-label={a.name}>
      <div
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-[960px] flex-col overflow-hidden rounded-2xl bg-(--c-b-ffffff) shadow-[0_24px_60px_rgba(0,0,0,0.2)] md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-[240px] flex-1 items-center justify-center bg-(--c-b-f4f4f2) p-4">
          {a.kind === "image" && a.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.url} alt={a.name} className="max-h-[70dvh] max-w-full rounded-lg object-contain" />
          ) : a.kind === "video" && a.url ? (
            <video src={a.url} controls playsInline className="max-h-[70dvh] max-w-full rounded-lg bg-black" />
          ) : a.kind === "audio" && a.url ? (
            <audio src={a.url} controls className="w-full max-w-[360px]" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-(--c-t-8a8a8a)">
              <IconFile size={40} />
              {extOf(a.name)}
            </span>
          )}
        </div>
        <div className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto p-6 md:w-[340px]">
          <div className="flex items-start gap-3">
            <h2 className="m-0 min-w-0 flex-1 break-words text-[17px] font-semibold text-(--c-t-1b1b1b)">{a.name}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
              <IconX />
            </button>
          </div>
          <div className="-mt-3 text-[13px] text-(--c-t-8a8a8a)">{facts.join(" · ")}</div>

          <Field label="Linked line">
            {a.wholeScript ? (
              <span className="text-(--c-t-8a8a8a)">The whole script (not a single line)</span>
            ) : (
              <>
                <span className="whitespace-pre-wrap">{a.linkedLine || <span className="text-(--c-t-8a8a8a)">(empty line)</span>}</span>
                {a.lineRemoved && <span className="mt-1 block text-[12px] text-(--c-t-b45309)">This line has since been removed from the script.</span>}
              </>
            )}
          </Field>
          <Field label="Script">
            <Link href={`/v/${a.videoId}`} className="font-medium text-(--c-t-2358d8) no-underline hover:underline">
              {a.scriptTitle}
            </Link>
          </Field>
          {a.commentText.trim() && (
            <Field label="Comment">
              <span className="whitespace-pre-wrap text-(--c-t-4a4a4a)">{a.commentText}</span>
            </Field>
          )}

          <div className="mt-auto flex gap-2 pt-2">
            {a.url && (
              <button
                type="button"
                onClick={() => void downloadFile(a.url!, a.name)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333)"
              >
                <IconDownload size={15} color="var(--c-on-ink)" />
                Download
              </button>
            )}
            <Link
              href={`/v/${a.videoId}`}
              className="inline-flex h-9 items-center rounded-lg border border-(--c-l-dcdcdc) px-3.5 text-[14px] font-medium text-(--c-t-1b1b1b) no-underline hover:bg-(--c-b-fafafa)"
            >
              Open script
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">{label}</div>
      <div className="text-[14px] leading-[1.55] text-(--c-t-1b1b1b)">{children}</div>
    </div>
  );
}
