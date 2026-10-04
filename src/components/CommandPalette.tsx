"use client";

import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../../convex/_generated/api";
import { statusOf } from "@/lib/types";
import { FormatIcon } from "./FormatIcon";
import { IconBoard, IconPlus, IconSearch } from "./icons";

/** Ask the switcher to open (e.g. from a button) */
export const openCommandPalette = () => window.dispatchEvent(new Event("native-note:palette"));

type View = "list" | "calendar" | "feed" | "library" | "tweet" | "brands" | "boards" | "topics" | "mymind";
type Item = {
  key: string;
  group: "Recent" | "Scripts" | "Boards" | "Views" | "Apps" | "Create";
  title: string;
  /** Extra words to match on (status, kind) */
  words?: string;
  icon: ReactNode;
  right?: ReactNode;
  href?: string;
  run?: () => void | Promise<void>;
  at?: number;
};

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
/** The sidebar's Views and Apps, in the same order */
const PAGES: { view: View; title: string; words: string; icon: ReactNode }[] = [
  { view: "list", title: "Scripts", words: "list all scripts home", icon: svg(<path d="M3 4h10M3 8h10M3 12h7" />) },
  { view: "calendar", title: "Calendar", words: "schedule dates live", icon: svg(<><rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></>) },
  { view: "feed", title: "Feed", words: "updates urgent", icon: svg(<path d="M3 4h10M3 8h10M3 12h10" />) },
  { view: "mymind", title: "Mymind", words: "ideas bookmarks saved", icon: svg(<><circle cx="5" cy="5" r="2.2" /><circle cx="11" cy="5" r="2.2" /><circle cx="5" cy="11" r="2.2" /><circle cx="11" cy="11" r="2.2" /></>) },
  { view: "library", title: "Library", words: "assets files footage", icon: svg(<><rect x="2.5" y="2.5" width="4" height="11" rx="1" /><rect x="8" y="2.5" width="4" height="11" rx="1" transform="rotate(-12 10 8)" /></>) },
  { view: "tweet", title: "Tweet", words: "x twitter post drafts", icon: svg(<path d="M3 3l10 10M13 3L3 13" />) },
  { view: "brands", title: "Brand deals", words: "sponsors partners sponsorships", icon: svg(<><path d="M8.5 2.5H13.5V7.5L7.5 13.5 2.5 8.5z" /><circle cx="10.75" cy="5.25" r="1" /></>) },
  { view: "boards", title: "Excalidraw", words: "boards whiteboard drawings", icon: <IconBoard size={16} /> },
  { view: "topics", title: "Topic opportunities", words: "ideas research youtube outliers keywords", icon: svg(<><path d="M2 12l4-4 2.5 2.5L14 5" /><path d="M10 5h4v4" /></>) },
];

const RECENT_KEY = "palette-recent";
type Recent = { href: string; at: number };
const readRecent = (): Recent[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
  } catch {
    return [];
  }
};
/** Scripts and boards opened lately, newest first (kept on this device) */
const pushRecent = (href: string) => {
  try {
    const list = [{ href, at: Date.now() }, ...readRecent().filter((r) => r.href !== href)].slice(0, 20);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
};

const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/**
 * How well `q` matches `text`, and which characters matched (for highlighting).
 * Whole-title prefix beats word starts, which beat a run inside a word, which beats scattered letters.
 */
function match(q: string, text: string, loose = true): { score: number; hits: number[] } | null {
  if (!q) return { score: 1, hits: [] };
  const t = text.toLowerCase();
  const i = t.indexOf(q);
  if (i >= 0) {
    const hits = Array.from({ length: q.length }, (_, k) => i + k);
    const atWord = i === 0 || /[\s\-_/:(]/.test(t[i - 1]);
    return { score: (i === 0 ? 1000 : atWord ? 700 : 400) - Math.min(i, 50) - text.length * 0.2, hits };
  }
  // Every word typed must start a word in the title (e.g. "cc upd" → "Claude Code Updates")
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const hits: number[] = [];
    let from = 0;
    for (const w of words) {
      const re = new RegExp(`(^|[\\s\\-_/:(])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
      re.lastIndex = from;
      const m = re.exec(t);
      if (!m) return null;
      const start = m.index + m[1].length;
      for (let k = 0; k < w.length; k++) hits.push(start + k);
      from = start + w.length;
    }
    return { score: 300 - text.length * 0.2, hits };
  }
  if (!loose) return null;
  // Initials and scattered letters, in order
  const hits: number[] = [];
  let at = 0;
  for (const ch of q) {
    const k = t.indexOf(ch, at);
    if (k < 0) return null;
    hits.push(k);
    at = k + 1;
  }
  const spread = hits[hits.length - 1] - hits[0];
  return { score: 100 - spread - text.length * 0.1, hits };
}

function Highlight({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>;
  const set = new Set(hits);
  const out: ReactNode[] = [];
  let run = "";
  let on = false;
  const flush = (k: number) => {
    if (!run) return;
    out.push(on ? <mark key={k} className="bg-transparent font-semibold text-(--c-t-1b1b1b)">{run}</mark> : <span key={k}>{run}</span>);
    run = "";
  };
  [...text].forEach((ch, i) => {
    const hit = set.has(i);
    if (hit !== on) {
      flush(i);
      on = hit;
    }
    run += ch;
  });
  flush(text.length);
  return <>{out}</>;
}

/**
 * ⌘K / Ctrl+K anywhere: jump to any script, board or page, or start a new one. Like Notion's and the Claude app's
 * quick switcher. In a script with words selected, ⌘K still makes a link (the editor handles it first).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  // Start loading the lists shortly after the page settles so the first open is instant
  const [warm, setWarm] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const t = setTimeout(() => setWarm(true), 1200);
    return () => clearTimeout(t);
  }, []);
  // Remember what's opened (from here, links, anywhere) for the Recent list
  useEffect(() => {
    if (/^\/(v|b)\/[^/]+$/.test(pathname)) pushRecent(pathname);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      // Words selected while typing in a script or text box: ⌘K is "make a link" there
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !el.closest("[data-command-palette]")));
      const sel = window.getSelection();
      if (typing && sel && !sel.isCollapsed && el!.isContentEditable) return;
      // Ours first (runs before Excalidraw's own shortcuts), so it works on boards too
      e.preventDefault();
      e.stopPropagation();
      setWarm(true);
      setOpen((o) => !o);
    };
    const onAsk = () => {
      setWarm(true);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("native-note:palette", onAsk);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("native-note:palette", onAsk);
    };
  }, []);

  const videos = useQuery(api.videos.list, warm ? {} : "skip");
  const boards = useQuery(api.boards.list, warm ? {} : "skip");
  if (!open) return null;
  return createPortal(<Palette videos={videos} boards={boards} onClose={() => setOpen(false)} />, document.body);
}

function Palette({
  videos,
  boards,
  onClose,
}: {
  videos: ReturnType<typeof useQuery<typeof api.videos.list>>;
  boards: ReturnType<typeof useQuery<typeof api.boards.list>>;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const createVideo = useMutation(api.videos.create);
  const createBoard = useMutation(api.boards.create);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [recent] = useState(readRecent);
  const back = useRef<HTMLElement | null>(typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null);

  // Esc closes it even if focus wandered off the search box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const restore = back.current;
    return () => {
      document.body.style.overflow = prev;
      restore?.focus?.({ preventScroll: true });
    };
  }, []);

  const goView = useCallback(
    (view: View) => {
      if (pathname === "/") window.dispatchEvent(new CustomEvent("native-note:view", { detail: view }));
      router.push(`/?view=${view}`);
    },
    [pathname, router],
  );

  const all = useMemo(() => {
    const scripts: Item[] = (videos ?? []).map((v) => {
      const st = statusOf(v.status);
      return {
        key: `v:${v._id}`,
        group: "Scripts",
        title: v.title.trim() || "Untitled",
        words: `${st.label} ${v.format === "short" ? "short" : "long"} script`,
        icon: <FormatIcon format={v.format} size={16} />,
        right: (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
            {st.label}
          </span>
        ),
        href: `/v/${v._id}`,
        at: v.updatedAt,
      };
    });
    const bs: Item[] = (boards ?? []).map((b) => ({
      key: `b:${b.id}`,
      group: "Boards",
      title: b.title,
      words: "board excalidraw",
      icon: <IconBoard size={16} />,
      right: <span>{ago(b.updatedAt)}</span>,
      href: `/b/${b.id}`,
      at: b.updatedAt,
    }));
    const pages: Item[] = PAGES.map((p) => ({
      key: `p:${p.view}`,
      group: p.view === "list" || p.view === "calendar" || p.view === "feed" ? "Views" : "Apps",
      title: p.title,
      words: `${p.words} app page`,
      icon: p.icon,
      run: () => goView(p.view),
    }));
    const create: Item[] = [
      {
        key: "new-script",
        group: "Create",
        title: "New script",
        words: "create add video",
        icon: <IconPlus size={15} />,
        run: async () => {
          const id = await createVideo({ format: "long" });
          router.push(`/v/${id}`);
        },
      },
      {
        key: "new-board",
        group: "Create",
        title: "New board",
        words: "create add excalidraw whiteboard drawing",
        icon: <IconPlus size={15} />,
        run: async () => {
          const id = await createBoard({});
          router.push(`/b/${id}`);
        },
      },
    ];
    return { scripts, bs, pages, create };
  }, [videos, boards, goView, createVideo, createBoard, router]);

  /** What shows: recents and pages when empty; otherwise the best matches, grouped */
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const byHref = new Map([...all.scripts, ...all.bs].map((i) => [i.href!, i]));
    if (!term) {
      const recents = recent
        .map((r) => byHref.get(r.href))
        .filter((i): i is Item => !!i && i.href !== pathname)
        .slice(0, 6)
        .map((i) => ({ item: { ...i, key: `r:${i.key}`, group: "Recent" as const }, hits: [] as number[] }));
      // Nothing opened yet: show the latest scripts and boards instead
      const fill = recents.length
        ? []
        : [...all.scripts.slice(0, 4), ...all.bs.slice(0, 2)].map((i) => ({ item: { ...i, key: `r:${i.key}`, group: "Recent" as const }, hits: [] as number[] }));
      return [...recents, ...fill, ...all.pages.map((item) => ({ item, hits: [] })), ...all.create.map((item) => ({ item, hits: [] }))];
    }
    const scored = (items: Item[], limit: number) =>
      items
        .map((item) => {
          const m = match(term, item.title);
          const w = !m && item.words ? match(term, item.words, false) : null;
          return m ? { item, hits: m.hits, score: m.score } : w ? { item, hits: [], score: w.score * 0.3 } : null;
        })
        .filter((x): x is { item: Item; hits: number[]; score: number } => !!x)
        // Ties go to the one touched most recently
        .sort((a, b) => b.score - a.score || (b.item.at ?? 0) - (a.item.at ?? 0))
        .slice(0, limit);
    const groups = [scored(all.scripts, 8), scored(all.bs, 5), scored(all.pages.filter((p) => p.group === "Views"), 3), scored(all.pages.filter((p) => p.group === "Apps"), 6), scored(all.create, 2)];
    // The group with the best match comes first
    groups.sort((a, b) => (b[0]?.score ?? -1e9) - (a[0]?.score ?? -1e9));
    return groups.flat();
  }, [q, all, recent, pathname]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = async (i: number, newTab = false) => {
    const row = rows[i];
    if (!row || busy) return;
    const it = row.item;
    if (it.href) {
      if (newTab) {
        window.open(it.href, "_blank");
        return;
      }
      onClose();
      router.push(it.href);
      return;
    }
    setBusy(true);
    try {
      await it.run?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const loading = videos === undefined || boards === undefined;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Jump to"
      data-command-palette
      className="fixed inset-0 z-[120] flex justify-center bg-black/25 px-3 pt-[12vh] animate-[board-fade_120ms_ease-out] sm:pt-[14vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-fit max-h-[min(560px,76vh)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-(--c-b-ffffff) shadow-[0_0_0_1px_var(--c-l-e3e3e0),0_24px_64px_rgba(0,0,0,0.22)] animate-[palette-in_180ms_cubic-bezier(0.2,0,0,1)]">
        <div className="flex h-[54px] shrink-0 items-center gap-3 border-b border-(--c-l-ebebeb) px-4 text-(--c-t-9a9a9a)">
          <IconSearch size={17} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
                e.preventDefault();
                setActive((a) => (rows.length ? (a + 1) % rows.length : 0));
              } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
                e.preventDefault();
                setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                void choose(active, e.metaKey || e.ctrlKey);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              } else if (e.key === "Home" && !q) {
                e.preventDefault();
                setActive(0);
              } else if (e.key === "End" && !q) {
                e.preventDefault();
                setActive(rows.length - 1);
              }
            }}
            placeholder="Jump to a script, board or page…"
            aria-label="Search"
            aria-controls="palette-results"
            aria-activedescendant={rows[active] ? `palette-${rows[active].item.key}` : undefined}
            spellCheck={false}
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
          />
          <kbd className="hidden shrink-0 rounded-md border border-(--c-l-e3e3e0) px-1.5 py-0.5 font-sans text-[11px] text-(--c-t-9a9a9a) sm:inline">esc</kbd>
        </div>
        <div ref={list} id="palette-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
          {rows.map(({ item, hits }, i) => {
            const header = i === 0 || rows[i - 1].item.group !== item.group ? item.group : null;
            return (
              <div key={item.key}>
                {header && <div className="px-2.5 pb-1 pt-2.5 text-[12px] font-medium text-(--c-t-9a9a9a)">{header}</div>}
                <button
                  type="button"
                  id={`palette-${item.key}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={(e) => void choose(i, e.metaKey || e.ctrlKey)}
                  className={`flex h-[42px] w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px] ${i === active ? "bg-(--c-b-f1f1ef)" : ""}`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-(--c-t-6b6b6b)">{item.icon}</span>
                  <span className={`min-w-0 flex-1 truncate ${hits.length ? "text-(--c-t-4a4a4a)" : "text-(--c-t-1b1b1b)"}`}>
                    <Highlight text={item.title} hits={hits} />
                  </span>
                  {item.right && <span className="shrink-0 text-[12px] text-(--c-t-9a9a9a)">{item.right}</span>}
                  {i === active && (
                    <span aria-hidden="true" className="hidden shrink-0 text-[12px] text-(--c-t-9a9a9a) sm:inline">
                      ↵
                    </span>
                  )}
                </button>
              </div>
            );
          })}
          {!rows.length && (
            <div className="px-3 py-10 text-center text-[14px] text-(--c-t-8a8a8a)">{loading ? "Loading…" : `Nothing matches "${q.trim()}"`}</div>
          )}
        </div>
        <div className="hidden h-9 shrink-0 items-center gap-4 border-t border-(--c-l-ebebeb) px-4 text-[12px] text-(--c-t-9a9a9a) sm:flex">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span>⌘↵ new tab</span>
          <span className="ml-auto">{busy ? "Opening…" : loading ? "Loading…" : "⌘K to close"}</span>
        </div>
      </div>
    </div>
  );
}
