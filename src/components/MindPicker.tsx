"use client";

import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Attachment } from "@/lib/types";
import { uid } from "@/lib/util";
import { LinkCard, hasLinkCard } from "./LinkCard";

export type MindIdea = {
  id: string;
  kind: "tweet" | "video" | "image" | "link" | "note";
  url: string | null;
  note: string;
  fileUrl: string | null;
  mime: string | null;
};

const firstLine = (s: string) => s.trim().split("\n")[0].slice(0, 90);
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** What an idea becomes in a comment: an attachment (link, image or video), or text for a plain note. */
export function ideaToAttachment(i: MindIdea): Attachment | null {
  const name = firstLine(i.note) || null;
  if (i.fileUrl) return { id: uid(), kind: i.mime?.startsWith("video/") ? "video" : "image", url: i.fileUrl, storageId: null, name, mime: i.mime, size: null };
  if (!i.url) return null;
  if (i.kind === "image") return { id: uid(), kind: "image", url: i.url, storageId: null, name, mime: null, size: null };
  return { id: uid(), kind: "link", url: i.url, storageId: null, name, mime: null, size: null };
}

/** The "@" menu in a comment: search Mymind and pick an idea to add. Arrow keys + Enter, or click. */
export function MindPicker({
  query,
  onPick,
  onClose,
  keyRef,
}: {
  query: string;
  onPick: (idea: MindIdea) => void;
  onClose: () => void;
  /** The comment box hands its arrow / Enter / Escape keys to the menu through this */
  keyRef: React.MutableRefObject<((e: React.KeyboardEvent) => boolean) | null>;
}) {
  const [search, setSearch] = useState(query);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // Bring the whole menu into view so it isn't cut off at the bottom
  useEffect(() => {
    box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);
  const ideas = (useQuery(api.ideas.list, search ? { search } : {}) ?? []).slice(0, 8) as MindIdea[];
  useEffect(() => setActive(0), [search]);

  keyRef.current = (e) => {
    if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, Math.max(0, ideas.length - 1)));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if ((e.key === "Enter" || e.key === "Tab") && ideas[active]) onPick(ideas[active]);
    else if (e.key === "Escape") onClose();
    else return false;
    e.preventDefault();
    return true;
  };

  return (
    <div
      ref={box}
      role="listbox"
      aria-label="Mymind ideas"
      onMouseDown={(e) => e.preventDefault()}
      className="mt-1.5 max-h-[60vh] overflow-y-auto rounded-xl border border-(--c-l-e5e5e5) bg-(--c-popover) p-1 shadow-(--shadow-picker-list)"
    >
      <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">
        Mymind{query ? ` · "${query}"` : ""}
      </div>
      {ideas.length === 0 ? (
        <div className="px-2 py-3 text-[13px] text-(--c-t-9a9a9a)">{search ? "No ideas match." : "Nothing in Mymind yet."}</div>
      ) : (
        ideas.map((i, n) => {
          const thumb = i.kind === "image" ? (i.fileUrl ?? i.url) : null;
          // Tweets, videos and other social links: show the same preview card as in comments
          if (i.url && hasLinkCard(i.url) && !thumb)
            return (
              <button
                key={i.id}
                type="button"
                role="option"
                aria-selected={n === active}
                onMouseEnter={() => setActive(n)}
                onClick={() => onPick(i)}
                className={`block w-full rounded-lg p-1.5 text-left ${n === active ? "bg-(--c-b-f1f1ef)" : ""}`}
              >
                <LinkCard url={i.url} compact plain />
                {i.note.trim() && <span className="mt-1 block truncate px-1 text-[12px] text-(--c-t-737373)">{firstLine(i.note)}</span>}
              </button>
            );
          return (
            <button
              key={i.id}
              type="button"
              role="option"
              aria-selected={n === active}
              onMouseEnter={() => setActive(n)}
              onClick={() => onPick(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left ${n === active ? "bg-(--c-b-f1f1ef)" : ""}`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-(--c-b-f1f1ef) text-[10px] font-semibold uppercase text-(--c-t-6b6b6b)">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : i.kind === "tweet" ? "X" : i.kind === "video" ? "▶" : i.kind === "note" ? "Aa" : "🔗"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-(--c-t-1b1b1b)">{firstLine(i.note) || (i.url ? host(i.url) : "Untitled idea")}</span>
                <span className="block truncate text-[11px] text-(--c-t-9a9a9a)">{i.url ? host(i.url) : i.fileUrl ? (i.mime?.startsWith("video/") ? "Video" : "Image") : "Note"}</span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
