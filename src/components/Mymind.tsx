"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { uploadToUrl } from "@/lib/upload";
import { linkify } from "./Brief";
import { LinkCard, OpenLink, hasLinkCard } from "./LinkCard";
import { IconSearch, IconTrash, IconUpload, IconX } from "./icons";

export type Idea = {
  id: Id<"ideas">;
  kind: "tweet" | "video" | "image" | "link" | "note";
  url: string | null;
  note: string;
  fileUrl: string | null;
  mime: string | null;
  authorName: string | null;
  agent: boolean;
  bookmarked: boolean;
  createdAt: number;
};

type Layout = "grid" | "list";

/** Mymind: saved ideas as cards (masonry or list), each with a note. Light grey, calm, fast. */
export function Mymind() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [layout, setLayout] = useState<Layout>("grid");
  const [open, setOpen] = useState<Idea | null>(null);
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    try {
      if (localStorage.getItem("mymind-layout") === "list") setLayout("list");
    } catch {}
  }, []);
  const ideas = useQuery(api.ideas.list, { ...(debounced ? { search: debounced } : {}), ...(onlyBookmarked ? { bookmarked: true } : {}) }) as Idea[] | undefined;
  // "/" jumps to search, like most apps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      document.getElementById("mymind-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pickLayout = (l: Layout) => {
    setLayout(l);
    try {
      localStorage.setItem("mymind-layout", l);
    } catch {}
  };

  return (
    <div className="min-h-full">
      <div className="mx-auto flex max-w-[640px] items-center gap-2">
        <label className="flex h-12 flex-1 items-center gap-3 rounded-full bg-(--c-b-ffffff) px-5 text-(--c-t-8a8a8a) shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-(--c-l-e3e3e0) focus-within:ring-(--c-l-c9c9c6)">
          <IconSearch />
          <input
            id="mymind-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={onlyBookmarked ? "Search bookmarks…" : "Search my mind…"}
            aria-label="Search ideas"
            className="w-full border-none bg-transparent text-[16px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
          />
        </label>
        <button
          type="button"
          aria-pressed={onlyBookmarked}
          onClick={() => setOnlyBookmarked(!onlyBookmarked)}
          title={onlyBookmarked ? "Show everything" : "Show bookmarks"}
          className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] ring-1 ${
            onlyBookmarked
              ? "bg-(--c-b-1b1b1b) font-medium text-(--c-on-ink) ring-(--c-l-1b1b1b)"
              : "bg-(--c-b-ffffff) text-(--c-t-6b6b6b) ring-(--c-l-e3e3e0) hover:text-(--c-t-1b1b1b)"
          }`}
        >
          <BookmarkIcon filled={onlyBookmarked} />
          <span className="hidden sm:inline">Bookmarks</span>
        </button>
        <div role="radiogroup" aria-label="Layout" className="flex rounded-full bg-(--c-b-ffffff) p-1 ring-1 ring-(--c-l-e3e3e0)">
          {(["grid", "list"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={layout === l}
              aria-label={l === "grid" ? "Grid" : "List"}
              title={l === "grid" ? "Grid" : "List"}
              onClick={() => pickLayout(l)}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${layout === l ? "bg-(--c-b-ececea) text-(--c-t-1b1b1b)" : "text-(--c-t-8a8a8a) hover:text-(--c-t-1b1b1b)"}`}
            >
              {l === "grid" ? <GridIcon /> : <ListIcon />}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {layout === "grid" ? (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
            {!debounced && !onlyBookmarked && (
              <div className="mb-4 break-inside-avoid">
                <AddIdea />
              </div>
            )}
            {(ideas ?? []).map((i) => (
              <div key={i.id} className="mb-4 break-inside-avoid">
                <IdeaCard idea={i} onOpen={() => setOpen(i)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-auto flex max-w-[860px] flex-col gap-3">
            {!debounced && !onlyBookmarked && <AddIdea />}
            {(ideas ?? []).map((i) => (
              <IdeaRow key={i.id} idea={i} onOpen={() => setOpen(i)} />
            ))}
          </div>
        )}
        {ideas && ideas.length === 0 && (
          <p className="mt-10 text-center text-[14px] text-(--c-t-737373)">
            {debounced
              ? `Nothing matches "${debounced}".`
              : onlyBookmarked
                ? "No bookmarks yet. Hover over a card and press the bookmark in its corner."
                : "Nothing saved yet. Paste a link, drop an image or write a note above."}
          </p>
        )}
      </div>

      {open && <IdeaDetail idea={(ideas ?? []).find((x) => x.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ---------- Adding ----------

function AddIdea() {
  const add = useMutation(api.ideas.add);
  const uploadUrl = useMutation(api.docs.generateUploadUrl);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!/^(image|video)\//.test(f.type)) return setError("Only images and videos can be uploaded.");
    setError("");
    setFile(f);
  };

  const save = async () => {
    const t = text.trim();
    if (!t && !file) return;
    // A first line that's just a link is the idea's link; the rest is the note
    const m = /^(https?:\/\/\S+)\s*([\s\S]*)$/.exec(t);
    setBusy(true);
    setError("");
    try {
      if (file) {
        const url = await uploadUrl();
        const storageId = await uploadToUrl(url, file, setProgress);
        await add({ storageId: storageId as Id<"_storage">, mime: file.type, note: t });
      } else if (m) {
        await add({ url: m[1], note: m[2].trim() });
      } else {
        await add({ note: t });
      }
      setText("");
      setFile(null);
      setProgress(0);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*ConvexError:\s*/, "") : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pick(e.dataTransfer.files[0]);
      }}
      className={`rounded-2xl bg-(--c-b-ffffff) p-4 ring-1 ${drag ? "ring-(--c-l-2358d8)" : "ring-(--c-l-e6e6e3)"}`}
    >
      <div className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-(--c-t-9a9a9a)">Add a new idea</div>
      <textarea
        id="mymind-add"
        value={text}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const f = [...e.clipboardData.files].find((x) => /^(image|video)\//.test(x.type));
          if (f) {
            e.preventDefault();
            pick(f);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
        }}
        placeholder="Paste a link (tweet, video, anything) or write a note…"
        className="block w-full resize-none bg-transparent text-[15px] leading-[1.55] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
      />
      {file && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-(--c-b-f4f4f2) px-2.5 py-1.5 text-[13px] text-(--c-t-4a4a4a)">
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          {busy && <span className="text-(--c-t-8a8a8a)">{Math.round(progress * 100)}%</span>}
          <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="text-(--c-t-8a8a8a) hover:text-(--c-t-1b1b1b)">
            <IconX size={13} />
          </button>
        </div>
      )}
      {error && <p className="m-0 mt-2 text-[13px] text-(--c-t-b42318)">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <input ref={input} id="mymind-file" type="file" accept="image/*,video/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-(--c-t-6b6b6b) ring-1 ring-(--c-l-e0e0dd) hover:text-(--c-t-1b1b1b) hover:ring-(--c-l-c9c9c6)"
        >
          <IconUpload size={13} />
          Image or video
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || (!text.trim() && !file)}
          className="ml-auto h-8 rounded-full bg-(--c-b-1b1b1b) px-4 text-[13px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-30"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ---------- Cards ----------

const addedOn = (t: number) => {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** The preview part of an idea, the same way everywhere (card, row, detail). */
function Preview({ idea, large, inert }: { idea: Idea; large?: boolean; /** Inside a card: clicking opens the idea, only the corner icon opens the original */ inert?: boolean }) {
  const src = idea.fileUrl ?? idea.url;
  if (idea.kind === "image" && src)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" loading="lazy" className={`block w-full bg-(--c-b-ececea) object-cover ${large ? "max-h-[70vh] object-contain" : ""}`} />
    );
  if (idea.kind === "video" && idea.fileUrl)
    return <video src={idea.fileUrl} controls={large} muted playsInline preload="metadata" className="block w-full bg-[#1b1b1b]" />;
  if (idea.url && hasLinkCard(idea.url))
    return (
      // The link card fills the top of the card edge to edge
      <div className="bg-(--c-b-ffffff) [&>*]:rounded-none! [&>*]:border-0!">
        <LinkCard url={idea.url} inert={inert} />
      </div>
    );
  if (idea.url && inert)
    return (
      <div className="relative bg-(--c-b-f4f4f2) px-4 py-5 pr-12">
        <OpenLink url={idea.url} label={`Open ${hostOf(idea.url)}`} />
        <div className="text-[12px] uppercase tracking-[0.06em] text-(--c-t-9a9a9a)">{hostOf(idea.url)}</div>
        <div className="mt-1 break-all text-[14px] text-(--c-t-2358d8)">{idea.url.replace(/^https?:\/\/(www\.)?/, "")}</div>
      </div>
    );
  if (idea.url)
    return (
      <a href={idea.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block bg-(--c-b-f4f4f2) px-4 py-5 no-underline hover:bg-(--c-b-efefec)">
        <div className="text-[12px] uppercase tracking-[0.06em] text-(--c-t-9a9a9a)">{hostOf(idea.url)}</div>
        <div className="mt-1 break-all text-[14px] text-(--c-t-2358d8)">{idea.url.replace(/^https?:\/\/(www\.)?/, "")}</div>
      </a>
    );
  return null;
}

export function IdeaCard({ idea, onOpen }: { idea: Idea; onOpen: () => void }) {
  const preview = <Preview idea={idea} inert />;
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen()}
      className="group/card cursor-pointer overflow-hidden rounded-2xl bg-(--c-b-ffffff) shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-(--c-l-e8e8e5) transition-[box-shadow] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)] hover:ring-(--c-l-d9d9d6) focus-visible:ring-(--c-l-2358d8)"
    >
      {preview}
      {(idea.note.trim() || !preview) && (
        <p className={`m-0 whitespace-pre-wrap break-words px-4 pt-3 leading-[1.55] text-(--c-t-2e2e2e) ${preview ? "line-clamp-5 text-[14px]" : "line-clamp-[12] text-[15px]"}`}>
          {idea.note}
        </p>
      )}
      <div className="flex items-center gap-2 py-1.5 pl-4 pr-1.5 text-[12px] text-(--c-t-9a9a9a)">
        <span className="min-w-0 flex-1 truncate">
          {addedOn(idea.createdAt)}
          {idea.url && !hasLinkCard(idea.url) && ` · ${hostOf(idea.url)}`}
        </span>
        <BookmarkButton idea={idea} />
      </div>
    </article>
  );
}

export function IdeaRow({ idea, onOpen }: { idea: Idea; onOpen: () => void }) {
  const hasPreview = idea.kind !== "note";
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen()}
      className="group/card flex cursor-pointer flex-col gap-4 overflow-hidden rounded-2xl bg-(--c-b-ffffff) p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-(--c-l-e8e8e5) hover:ring-(--c-l-d9d9d6) sm:flex-row"
    >
      {hasPreview && (
        <div className="max-h-[220px] w-full shrink-0 overflow-hidden rounded-xl sm:w-[300px]">
          <Preview idea={idea} inert />
        </div>
      )}
      <div className="relative min-w-0 flex-1 py-1 pr-8">
        <span className="absolute -right-1 bottom-0">
          <BookmarkButton idea={idea} />
        </span>
        {idea.note.trim() ? (
          <p className="m-0 line-clamp-6 whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-(--c-t-2e2e2e)">{idea.note}</p>
        ) : (
          <p className="m-0 text-[14px] text-(--c-t-9a9a9a)">No note</p>
        )}
        <div className="mt-2 text-[12px] text-(--c-t-9a9a9a)">
          {addedOn(idea.createdAt)}
          {idea.url && ` · ${hostOf(idea.url)}`}
        </div>
      </div>
    </article>
  );
}

// ---------- Detail ----------

function IdeaDetail({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const updateNote = useMutation(api.ideas.updateNote);
  const remove = useMutation(api.ideas.remove);
  const [note, setNote] = useState(idea.note);
  const [confirming, setConfirming] = useState(false);
  const saved = useRef(idea.note);
  const save = () => {
    if (note !== saved.current) {
      saved.current = note;
      void updateNote({ id: idea.id, note });
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        save();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const close = () => {
    save();
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={close}>
      <div
        role="dialog"
        aria-label="Idea"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl bg-(--c-b-ffffff) shadow-[0_24px_60px_rgba(0,0,0,0.18)] md:flex-row"
      >
        {idea.kind !== "note" && (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-(--c-b-f4f4f2) md:max-w-[62%]">
            <div className="w-full">
              <Preview idea={idea} large />
            </div>
          </div>
        )}
        <div className="flex min-h-0 w-full flex-col gap-3 p-5 md:w-[380px] md:shrink-0">
          <div className="flex items-center justify-between text-[12px] text-(--c-t-737373)">
            <span>
              Added {addedOn(idea.createdAt)}
              {idea.authorName && ` by ${idea.authorName}`}
            </span>
            <button type="button" aria-label="Close" onClick={close} className="flex h-8 w-8 items-center justify-center rounded-full text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f2) hover:text-(--c-t-1b1b1b)">
              <IconX size={15} />
            </button>
          </div>
          <label htmlFor="idea-note" className="text-[12px] font-medium uppercase tracking-[0.06em] text-(--c-t-9a9a9a)">
            Note
          </label>
          <textarea
            id="idea-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={save}
            placeholder="Why is this worth keeping?"
            className="min-h-[160px] flex-1 resize-none rounded-xl bg-(--c-b-fafaf9) p-3 text-[15px] leading-[1.6] text-(--c-t-1b1b1b) outline-none ring-1 ring-(--c-l-e6e6e3) placeholder:text-(--c-t-9a9a9a) focus:ring-(--c-l-c9c9c6)"
          />
          {idea.note.trim() && note === idea.note && /https?:\/\//.test(note) && (
            <p className="m-0 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[13px] text-(--c-t-737373)">{linkify(note)}</p>
          )}
          <div className="flex items-center gap-2">
            <BookmarkButton idea={idea} always />
            {(idea.url || idea.fileUrl) && (
              <a
                href={idea.url ?? idea.fileUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-full bg-(--c-b-1b1b1b) px-4 text-[13px] font-medium text-(--c-on-ink) no-underline hover:bg-(--c-b-333333)"
              >
                Open original
              </a>
            )}
            {confirming ? (
              <span className="ml-auto flex items-center gap-2 text-[13px] text-(--c-t-4a4a4a)">
                Delete this idea?
                <button
                  type="button"
                  onClick={async () => {
                    await remove({ id: idea.id });
                    onClose();
                  }}
                  className="h-8 rounded-full bg-(--c-b-b42318) px-3 font-medium text-white hover:bg-(--c-b-c7301f)"
                >
                  Delete
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="h-8 rounded-full px-3 text-(--c-t-737373) hover:text-(--c-t-1b1b1b)">
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label="Delete idea"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f2) hover:text-(--c-t-b42318)"
              >
                <IconTrash />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Bookmark toggle: shows on hover, and stays (filled) once bookmarked. */
function BookmarkButton({ idea, always }: { idea: Idea; always?: boolean }) {
  const setBookmark = useMutation(api.ideas.setBookmark);
  const [on, setOn] = useState(idea.bookmarked);
  useEffect(() => setOn(idea.bookmarked), [idea.bookmarked]);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove bookmark" : "Bookmark"}
      title={on ? "Remove bookmark" : "Bookmark"}
      onClick={(e) => {
        e.stopPropagation();
        setOn(!on);
        void setBookmark({ id: idea.id, bookmarked: !on });
      }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity hover:bg-(--c-b-f4f4f2) ${
        on ? "text-(--c-t-2358d8)" : "text-(--c-t-8a8a8a) hover:text-(--c-t-1b1b1b)"
      } ${on || always ? "" : "opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100 pointer-coarse:opacity-100"}`}
    >
      <BookmarkIcon filled={on} />
    </button>
  );
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2.25h8a.75.75 0 0 1 .75.75v10.9a.35.35 0 0 1-.56.28L8 11.1l-4.19 3.08a.35.35 0 0 1-.56-.28V3A.75.75 0 0 1 4 2.25Z" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2.25" y="2.25" width="4.5" height="6.5" rx="1.2" />
      <rect x="9.25" y="2.25" width="4.5" height="4" rx="1.2" />
      <rect x="2.25" y="11.25" width="4.5" height="2.5" rx="1.2" />
      <rect x="9.25" y="8.75" width="4.5" height="5" rx="1.2" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </svg>
  );
}
