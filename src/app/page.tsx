"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CalendarView } from "@/components/CalendarView";
import { FeedView } from "@/components/FeedView";
import { Mymind } from "@/components/Mymind";
import { Library } from "@/components/Library";
import { usePresence } from "@/lib/usePresence";
import { PartnerLogo } from "@/components/VideoMeta";
import { PinnedVideos } from "@/components/PinnedVideos";
import { BoardsList } from "@/components/BoardsList";
import { FilterSelect } from "@/components/FeedView";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Tweet } from "@/components/Tweet";
import { BrandDeals } from "@/components/BrandDeals";
import { HomeSidebar, SidebarIcon, type View } from "@/components/HomeSidebar";
import { FormatIcon } from "@/components/FormatIcon";
import { TeamGate } from "@/components/TeamGate";
import { IconCheck, IconPencil, IconTrash, IconX, IconPin, IconPlus } from "@/components/icons";
import { useIsMobile } from "@/lib/useIsMobile";
import { FORMATS, SPONSORSHIPS, STATUSES, isPaidSponsor, statusOf, type Sponsorship, type VideoFormat, type VideoStatus } from "@/lib/types";

export default function Home() {
  return (
    <TeamGate>
      <ScriptList />
    </TeamGate>
  );
}

/** "Sep 12", with the year only when it isn't this year. */
function shortDate(d: string | null) {
  if (!d) return "";
  const date = new Date(`${d}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
}

function edited(ts: number) {
  const now = new Date();
  const d = new Date(ts);
  const mins = (now.getTime() - ts) / 60000;
  if (mins < 60) return mins < 2 ? "Just now" : `${Math.floor(mins)} minutes ago`;
  if (mins < 60 * 6) return `${Math.floor(mins / 60)} hour${mins < 120 ? "" : "s"} ago`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type SortKey = "title" | "format" | "liveDate" | "status" | "edited";
type Sortable = { title: string; format: string; liveDate: string | null; status: string; updatedAt: number };

/** Compares two scripts on one column; empty values (no title, no live date) always go last. */
function compare(a: Sortable, b: Sortable, key: SortKey): number {
  switch (key) {
    case "title":
      return (a.title || "\uffff").localeCompare(b.title || "\uffff", undefined, { sensitivity: "base", numeric: true });
    case "format":
      return a.format.localeCompare(b.format);
    case "liveDate":
      return (a.liveDate ?? "9999").localeCompare(b.liveDate ?? "9999");
    case "status":
      return STATUSES.findIndex((s) => s.value === statusOf(a.status).value) - STATUSES.findIndex((s) => s.value === statusOf(b.status).value);
    case "edited":
      return a.updatedAt - b.updatedAt;
  }
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: "edited", label: "Last edited" },
  { key: "title", label: "Title" },
  { key: "liveDate", label: "Live date" },
  { key: "status", label: "Status" },
  { key: "format", label: "Format" },
];

/** A small sort button that opens a menu (like Notion): pick a field, then the direction. */
function SortMenu({ sort, onChange }: { sort: { key: SortKey; dir: 1 | -1 }; onChange: (s: { key: SortKey; dir: 1 | -1 }) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const custom = !(sort.key === "edited" && sort.dir === -1);
  const current = SORTS.find((x) => x.key === sort.key)?.label;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort: ${current}, ${sort.dir === 1 ? "ascending" : "descending"}`}
        title="Sort"
        onClick={() => setOpen(!open)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] hover:bg-(--c-b-f4f4f4) ${custom ? "text-(--c-t-2358d8)" : "text-(--c-t-737373)"}`}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.5 2.5v11M2 11l2.5 2.5L7 11M11.5 13.5v-11M9 5l2.5-2.5L14 5" />
        </svg>
        {custom && <span>{current}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-40 w-52 rounded-xl border border-(--c-l-ebebeb) bg-(--c-b-ffffff) p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.10)]">
          <div className="px-2 pb-1 pt-1 text-[12px] text-(--c-t-9a9a9a)">Sort by</div>
          {SORTS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="menuitemradio"
              aria-checked={sort.key === x.key}
              onClick={() => onChange({ key: x.key, dir: x.key === "edited" ? -1 : 1 })}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[14px] text-(--c-t-1b1b1b) hover:bg-(--c-b-f4f4f4)"
            >
              {x.label}
              {sort.key === x.key && <IconCheck size={14} />}
            </button>
          ))}
          <div className="mx-1 my-1 h-px bg-(--c-b-ebebeb)" />
          <div className="flex gap-1 p-1">
            {([1, -1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                aria-pressed={sort.dir === dir}
                onClick={() => onChange({ key: sort.key, dir })}
                className={`h-7 flex-1 rounded-md text-[13px] ${sort.dir === dir ? "bg-(--c-b-f0f0f0) font-medium text-(--c-t-1b1b1b)" : "text-(--c-t-737373) hover:bg-(--c-b-f7f7f7)"}`}
              >
                {dir === 1 ? "Ascending" : "Descending"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The sponsorship pill at the far right of a row: colored by type, dashed "Sponsor?" when nobody has decided. */
function SponsorPill({ id, title, value, onChange }: { id: string; title: string; value: Sponsorship; onChange: (s: Sponsorship) => void }) {
  const opt = SPONSORSHIPS.find((x) => x.value === value) ?? SPONSORSHIPS[0];
  const unset = value === "none";
  return (
    <Cell className={`relative inline-flex sm:w-[96px] sm:justify-end ${unset ? "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100" : ""}`}>
      <span
        className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium ${
          unset ? "border border-dashed border-(--c-l-d4d4d4) text-(--c-t-9a9a9a)" : opt.pill
        }`}
      >
        {unset ? "Sponsor?" : opt.label}
      </span>
      <select
        id={`sponsored-${id}`}
        aria-label={`Sponsorship of ${title || "Untitled"}`}
        value={value}
        onChange={(e) => onChange(e.target.value as Sponsorship)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {SPONSORSHIPS.map((x) => (
          <option key={x.value} value={x.value}>
            {x.value === "none" ? "Not decided" : x.label}
          </option>
        ))}
      </select>
    </Cell>
  );
}

const cellCls = "relative inline-flex w-fit items-center rounded-md px-1.5 py-0.5 hover:bg-(--c-b-f0f0f0)";

/** A spot inside a row link that can be edited in place: clicks here don't open the script. */
function Cell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </span>
  );
}

/** The title, with a pencil (on hover) to rename it without opening the script. */
function TitleCell({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  if (editing)
    return (
      <Cell className="block">
        <input
          autoFocus
          value={draft}
          aria-label="Title"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft.trim() !== title) onRename(draft.trim().slice(0, 300));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(title);
              setEditing(false);
            }
          }}
          className="w-full rounded-md border border-(--c-l-dcdcdc) bg-(--c-b-ffffff) px-1.5 py-0.5 text-[16px] font-medium text-(--c-t-1b1b1b) outline-none"
        />
      </Cell>
    );
  return (
    <div className="text-[16px] font-medium leading-[1.4] sm:flex sm:min-w-0 sm:items-center">
      <span className={`break-words sm:truncate ${title ? "text-(--c-t-1b1b1b)" : "text-(--c-t-9a9a9a)"}`} title={title || undefined}>
        {title || "Untitled"}
      </span>
      <Cell className="ml-1 inline-flex shrink-0 align-[-4px]">
        <button
          type="button"
          aria-label={`Rename ${title || "Untitled"}`}
          title="Rename"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-(--c-t-9a9a9a) opacity-0 hover:bg-(--c-b-f0f0f0) hover:text-(--c-t-1b1b1b) focus-visible:opacity-100 group-hover:opacity-100"
        >
          <IconPencil size={13} />
        </button>
      </Cell>
    </div>
  );
}


function ScriptList() {
  const router = useRouter();
  const videos = useQuery(api.videos.list);
  // Lets a script's "Scripts" button go back here (keeping this page's view and scroll)
  useEffect(() => {
    try {
      sessionStorage.setItem("nn-last-page", "/");
    } catch {}
  }, []);
  const partners = useQuery(api.partners.list);
  const partnerById = new Map((partners ?? []).map((p) => [p.id as string, p]));
  const me = useQuery(api.users.me);
  const create = useMutation(api.videos.create);
  const remove = useMutation(api.videos.remove);
  const update = useMutation(api.videos.update);
  const setPinned = useMutation(api.videos.setPinned);
  const [filter, setFilter] = useState<"all" | VideoFormat>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | VideoStatus>("inProduction");
  const [sponsorFilter, setSponsorFilter] = useState<"all" | "sponsored" | "notSponsored">("all");
  const isSponsored = (v: { sponsored?: string }) => isPaidSponsor(v.sponsored);
  const [search, setSearch] = useState("");
  // Newest edits first until a column header is clicked
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "edited", dir: -1 });
  const [creating, setCreating] = useState(false);
  const mobile = useIsMobile();
  const [view, setView] = useState<View>("list");
  /** The status / sponsorship / format filters only show after pressing Filter */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Remember the view and whether the sidebar is shown (desktop), per browser
  useEffect(() => {
    try {
      const saved = localStorage.getItem("home-view");
      // ?view=… (e.g. coming back from a board) wins over the remembered view
      const asked = new URLSearchParams(window.location.search).get("view") ?? saved;
      if (asked && ["calendar", "feed", "mymind", "library", "tweet", "brands", "boards", "list"].includes(asked)) setView(asked as View);
      if (localStorage.getItem("home-sidebar") === "0") setSidebarOpen(false);
      setFiltersOpen(localStorage.getItem("home-filters") === "1");
      if (localStorage.getItem("home-sidebar") === "0") setSidebarOpen(false);
    } catch {}
  }, []);
  useEffect(() => {
    if (mobile) setSidebarOpen(false);
  }, [mobile]);
  // Filters and sort stay as you left them (saved in this browser)
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("home-prefs") ?? "{}");
      if (p.status && (p.status === "all" || STATUSES.some((x) => x.value === p.status))) setStatusFilter(p.status);
      if (["all", "sponsored", "notSponsored"].includes(p.sponsor)) setSponsorFilter(p.sponsor);
      if (["all", "long", "short"].includes(p.format)) setFilter(p.format);
      if (p.sort && ["title", "format", "liveDate", "status", "edited"].includes(p.sort.key) && (p.sort.dir === 1 || p.sort.dir === -1)) setSort(p.sort);
    } catch {}
    setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem("home-prefs", JSON.stringify({ status: statusFilter, sponsor: sponsorFilter, format: filter, sort }));
    } catch {}
  }, [prefsLoaded, statusFilter, sponsorFilter, filter, sort]);
  const remember = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };
  const drawer = usePresence(mobile && sidebarOpen, 200);
  // No slide on the first paint (the saved open/closed state is applied then)
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 300);
    return () => clearTimeout(t);
  }, []);
  const toggleSidebar = (open: boolean) => {
    setSidebarOpen(open);
    if (!mobile) remember("home-sidebar", open ? "1" : "0");
  };

  const newScript = async () => {
    setCreating(true);
    try {
      const id = await create({ format: filter === "short" ? "short" : "long", ...(statusFilter !== "all" ? { status: statusFilter } : {}) });
      router.push(`/v/${id}`);
    } catch {
      setCreating(false);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = (videos ?? []).filter(
    (v) =>
      (statusFilter === "all" || statusOf(v.status).value === statusFilter) &&
      (sponsorFilter === "all" || (sponsorFilter === "sponsored") === isSponsored(v)) &&
      (filter === "all" || v.format === filter) &&
      (!q || (v.title || "untitled").toLowerCase().includes(q)),
  );
  shown.sort((a, b) => {
    const c = compare(a, b, sort.key);
    // Empty titles and dates stay at the bottom whichever way you sort
    const emptyA = (sort.key === "title" && !a.title) || (sort.key === "liveDate" && !a.liveDate);
    const emptyB = (sort.key === "title" && !b.title) || (sort.key === "liveDate" && !b.liveDate);
    if (emptyA !== emptyB) return emptyA ? 1 : -1;
    return c * sort.dir || b.updatedAt - a.updatedAt;
  });

  const onMove = (id: string, liveDate: string) => void update({ id: id as Id<"videos">, liveDate: liveDate || null });
  const all = videos ?? [];
  const counts = videos
    ? {
        status: Object.fromEntries([...STATUSES.map((x) => x.value), "all"].map((k) => [k, all.filter((v) => k === "all" || statusOf(v.status).value === k).length])),
        sponsor: {
          all: all.length,
          sponsored: all.filter(isSponsored).length,
          notSponsored: all.filter((v) => !isSponsored(v)).length,
        },
        format: { all: all.length, long: all.filter((v) => v.format === "long").length, short: all.filter((v) => v.format === "short").length },
      }
    : undefined;
  const sidebar = (
    <HomeSidebar
      search={search}
      onSearch={setSearch}
      view={view}
      onView={(v) => {
        setView(v);
        remember("home-view", v);
        if (mobile) setSidebarOpen(false);
      }}
      onClose={() => toggleSidebar(false)}
    />
  );
  const activeFilters = (statusFilter !== "all" ? 1 : 0) + (sponsorFilter !== "all" ? 1 : 0) + (filter !== "all" ? 1 : 0);
  const heading = [
    statusFilter === "all" ? "All scripts" : statusOf(statusFilter).label,
    sponsorFilter === "sponsored" ? "sponsored" : sponsorFilter === "notSponsored" ? "not sponsored" : null,
    filter === "all" ? null : FORMATS.find((x) => x.value === filter)?.label.toLowerCase(),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative flex min-h-screen bg-(--c-b-ffffff)">
      {/* Desktop: a sidebar that can be hidden. Phones: a drawer over the page. */}
      {!mobile && (
        // Slides open and shut (width animates; the contents keep their width so nothing reflows)
        <div
          aria-hidden={!sidebarOpen}
          className={`sticky top-0 h-screen shrink-0 overflow-hidden ${animate ? "transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]" : ""} ${
            sidebarOpen ? "w-[248px]" : "w-0"
          }`}
        >
          <aside inert={!sidebarOpen} className="h-full w-[248px] overflow-y-auto border-r border-(--c-l-ececec) bg-(--c-b-f9f9f8)">
            {sidebar}
          </aside>
        </div>
      )}
      {mobile && drawer.mounted && (
        <div className="fixed inset-0 z-50 flex">
          <aside
            className={`h-full w-[280px] max-w-[85vw] overflow-y-auto bg-(--c-b-f9f9f8) shadow-[8px_0_30px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
              drawer.visible ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            {sidebar}
          </aside>
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className={`flex-1 bg-black/20 transition-opacity duration-200 ${drawer.visible ? "opacity-100" : "opacity-0"}`}
          />
        </div>
      )}

      {view === "mymind" || view === "library" || view === "tweet" || view === "brands" || view === "boards" ? (
        // Mymind is its own light-grey space for ideas, separate from scripts
        <div className="relative min-h-screen min-w-0 flex-1 bg-(--c-b-f7f7f5)">
          <div className="px-5 pb-24 pt-6 sm:px-8">
            <div className="flex min-h-9 items-center">
              {(!sidebarOpen || mobile) && (
                <button
                  type="button"
                  onClick={() => toggleSidebar(true)}
                  aria-label="Show sidebar"
                  title="Show sidebar"
                  className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-md text-(--c-t-737373) hover:bg-(--c-b-ececea) hover:text-(--c-t-1b1b1b)"
                >
                  <SidebarIcon />
                </button>
              )}
            </div>
            <div className="mt-4">
              {view === "library" ? <Library /> : view === "tweet" ? <Tweet /> : view === "brands" ? <BrandDeals /> : view === "boards" ? <BoardsList /> : <Mymind />}
            </div>
          </div>
        </div>
      ) : (
      <div className="relative min-w-0 flex-1">
        <AccountButton initial={(me?.name || me?.email || "?").slice(0, 1).toUpperCase()} email={me?.email ?? ""} />
        <div className={`mx-auto px-5 pb-24 pt-6 ${view === "calendar" ? "max-w-[1180px]" : "max-w-[1120px]"}`}>
          <div className="flex min-h-9 items-center gap-2 pr-12">
            {(!sidebarOpen || mobile) && (
              <button
                type="button"
                onClick={() => toggleSidebar(true)}
                aria-label="Show sidebar"
                title="Show sidebar"
                className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-md text-(--c-t-737373) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
              >
                <SidebarIcon />
              </button>
            )}
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-b border-(--c-l-ebebeb) pb-3">
            <div>
              <h1 className="m-0 text-[32px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">{view === "calendar" ? "Calendar" : view === "feed" ? "Feed" : "Scripts"}</h1>
              {view !== "feed" && <p className="m-0 mt-1 text-[14px] text-(--c-t-737373)">
                {heading}
                {q && ` · matching "${search.trim()}"`}
                {videos && ` · ${shown.length}`}
              </p>}
            </div>
            <div className="flex items-center gap-1.5">
              {view !== "feed" && (
                <button
                  type="button"
                  aria-pressed={filtersOpen}
                  onClick={() => {
                    setFiltersOpen(!filtersOpen);
                    remember("home-filters", filtersOpen ? "0" : "1");
                  }}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-(--c-b-f4f4f4) ${
                    activeFilters ? "text-(--c-t-2358d8)" : "text-(--c-t-737373)"
                  }`}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
                  </svg>
                  Filter{activeFilters ? ` · ${activeFilters}` : ""}
                </button>
              )}
              {view === "list" && <SortMenu sort={sort} onChange={setSort} />}
              <button
                type="button"
                onClick={newScript}
                disabled={creating}
                className="ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-3 text-[13px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-50"
              >
                <IconPlus size={14} color="var(--c-on-ink)" />
                New script
              </button>
            </div>
          </div>

          {filtersOpen && view !== "feed" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Status"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                options={[
                  { value: "all", label: `All statuses${counts ? ` (${counts.status.all})` : ""}` },
                  ...STATUSES.map((x) => ({ value: x.value, label: `${x.label}${counts ? ` (${counts.status[x.value] ?? 0})` : ""}` })),
                ]}
              />
              <FilterSelect
                label="Sponsorship"
                value={sponsorFilter}
                onChange={(v) => setSponsorFilter(v as typeof sponsorFilter)}
                options={[
                  { value: "all", label: `All sponsorships${counts ? ` (${counts.sponsor.all})` : ""}` },
                  { value: "sponsored", label: `Sponsored${counts ? ` (${counts.sponsor.sponsored})` : ""}` },
                  { value: "notSponsored", label: `Not sponsored${counts ? ` (${counts.sponsor.notSponsored})` : ""}` },
                ]}
              />
              <FilterSelect
                label="Format"
                value={filter}
                onChange={(v) => setFilter(v as typeof filter)}
                options={[
                  { value: "all", label: `All formats${counts ? ` (${counts.format.all})` : ""}` },
                  ...FORMATS.map((x) => ({ value: x.value, label: `${x.label}${counts ? ` (${counts.format[x.value] ?? 0})` : ""}` })),
                ]}
              />
              {activeFilters > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("all");
                    setSponsorFilter("all");
                    setFilter("all");
                  }}
                  className="h-8 rounded-full px-3 text-[13px] text-(--c-t-737373) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {videos && (
            <PinnedVideos
              videos={videos as Parameters<typeof PinnedVideos>[0]["videos"]}
              partnerOf={(id) => (id ? partnerById.get(id) : undefined)}
              onUnpin={(id) => void setPinned({ id: id as Id<"videos">, pinned: false })}
            />
          )}

          {view === "calendar" ? (
            <div className="mt-5">{videos && <CalendarView videos={shown} onMove={onMove} />}</div>
          ) : view === "feed" ? (
            <div className="mt-5">
              <FeedView />
            </div>
          ) : (
            <>
        <div className="h-2" />
        {videos === undefined ? null : shown.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-(--c-t-737373)">
            {videos.length === 0 ? (
              <>
                No scripts yet.{" "}
                <button type="button" onClick={newScript} className="font-medium text-(--c-t-2358d8)">
                  Start one
                </button>
              </>
            ) : (
              q ? "Nothing matches." : statusFilter === "all" ? "Nothing here yet." : `No ${statusOf(statusFilter).label.toLowerCase()} scripts${filter === "all" ? "" : " in this format"}.`
            )}
          </div>
        ) : (
          shown.map((v) => {
            const st = statusOf(v.status);
            return (
              <div key={v._id} className="group relative">
                <Link
                  href={`/v/${v._id}`}
                  className="block rounded-md border-b border-(--c-l-f0f0f0) px-3 py-3.5 text-[14px] text-(--c-t-262626) no-underline hover:bg-(--c-b-fafafa) sm:flex sm:items-center sm:gap-4 sm:py-2.5"
                >
                  <div className="min-w-0 sm:flex-1">
                    <TitleCell title={v.title} onRename={(title) => void update({ id: v._id as Id<"videos">, title })} />
                  </div>
                  {/* Phones: a second line. Computers: right-aligned on the same line. Each part is editable in place. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] sm:mt-0 sm:shrink-0 sm:flex-nowrap sm:justify-end">
                    {v.editedCount > 0 && (
                      <span className="whitespace-nowrap rounded-full bg-(--c-b-fdecea) px-2 py-0.5 text-[11px] font-medium text-(--c-t-b42318)">
                        {v.editedCount === 1 ? "Edited version" : `${v.editedCount} edited`}
                      </span>
                    )}
                    <Cell className={`${cellCls} gap-2 whitespace-nowrap text-(--c-t-6b6b6b)`}>
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: st.dot }} aria-hidden="true" />
                      {st.label}
                      <select
                        id={`status-${v._id}`}
                        aria-label={`Status of ${v.title || "Untitled"}`}
                        value={st.value}
                        onChange={(e) => void update({ id: v._id as Id<"videos">, status: e.target.value as VideoStatus })}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      >
                        {STATUSES.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </Cell>
                    <Cell className={`${cellCls} py-1`}>
                      <FormatIcon format={v.format} size={15} />
                      <select
                        id={`format-${v._id}`}
                        aria-label={`Format of ${v.title || "Untitled"}`}
                        value={v.format}
                        onChange={(e) => void update({ id: v._id as Id<"videos">, format: e.target.value as VideoFormat })}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      >
                        {FORMATS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </Cell>
                    <span className="inline-flex items-center sm:w-[92px] sm:justify-end">
                      {v.liveDate && (
                        <Cell className="inline-flex">
                          <button
                            type="button"
                            aria-label={`Clear the live date of ${v.title || "Untitled"}`}
                            title="Clear date"
                            onClick={() => void update({ id: v._id as Id<"videos">, liveDate: null })}
                            className="flex h-6 w-5 items-center justify-center rounded text-(--c-t-9a9a9a) opacity-0 hover:bg-(--c-b-f0f0f0) hover:text-(--c-t-1b1b1b) focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <IconX size={11} />
                          </button>
                        </Cell>
                      )}
                      <Cell
                        className={`${cellCls} whitespace-nowrap ${v.liveDate ? "text-(--c-t-1b1b1b)" : "text-(--c-t-b0b0b0) sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"}`}
                      >
                        {v.liveDate ? shortDate(v.liveDate) : "Add date"}
                        <input
                          id={`date-${v._id}`}
                          type="date"
                          aria-label={`Live date of ${v.title || "Untitled"}`}
                          value={v.liveDate ?? ""}
                          onChange={(e) => void update({ id: v._id as Id<"videos">, liveDate: e.target.value || null })}
                          onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </Cell>
                    </span>
                    {/* The brand partner's logo (same as Partner Sponsor in Details); pick one here too */}
                    {(() => {
                      const partner = v.partnerId ? partnerById.get(v.partnerId) : undefined;
                      return (
                        <Cell
                          className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-(--c-b-f4f4f4) ${
                            partner ? "" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"
                          }`}
                        >
                          <span title={partner ? `Partner: ${partner.name}` : "Add partner sponsor"} className="inline-flex">
                            {partner ? (
                              <PartnerLogo p={partner} size={20} className="ring-1 ring-(--c-hairline)" />
                            ) : (
                              <span className="h-5 w-5 rounded-[22%] border border-dashed border-(--c-l-d4d4d4)" />
                            )}
                          </span>
                          <select
                            aria-label={`Partner sponsor of ${v.title || "Untitled"}`}
                            value={v.partnerId ?? ""}
                            onChange={(e) => void update({ id: v._id as Id<"videos">, partnerId: (e.target.value || null) as Id<"partners"> | null })}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          >
                            <option value="">No partner</option>
                            {(partners ?? []).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </Cell>
                      );
                    })()}
                    <SponsorPill
                      id={v._id}
                      title={v.title}
                      value={(v.sponsored ?? "none") as Sponsorship}
                      onChange={(sponsored) => void update({ id: v._id as Id<"videos">, sponsored })}
                    />
                    <span className="ml-auto text-[12px] text-(--c-t-9a9a9a) sm:hidden">
                      Edited {edited(v.updatedAt).replace(/^(Just now|Today|Yesterday)$/, (w) => w.toLowerCase())}
                    </span>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-pressed={!!v.pinnedAt}
                  aria-label={v.pinnedAt ? `Unpin ${v.title || "Untitled"}` : `Pin ${v.title || "Untitled"}`}
                  title={v.pinnedAt ? "Unpin" : "Pin to the top"}
                  onClick={() => void setPinned({ id: v._id as Id<"videos">, pinned: !v.pinnedAt })}
                  // Just left of the row, like the delete button on the right
                  className={`absolute -left-10 top-0 bottom-0 hidden w-10 items-center justify-center transition-opacity sm:flex ${
                    v.pinnedAt ? "text-(--c-t-2358d8) opacity-100" : "text-(--c-t-9a9a9a) opacity-0 hover:text-(--c-t-1b1b1b) focus-visible:opacity-100 group-hover:opacity-100"
                  }`}
                >
                  <IconPin size={15} filled={!!v.pinnedAt} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${v.title || "Untitled"}`}
                  onClick={async () => {
                    if (!confirm(`Delete "${v.title || "Untitled"}" and all its files? This can't be undone.`)) return;
                    await remove({ id: v._id as Id<"videos"> });
                  }}
                  // Sits right against the row (no gap) and stays hoverable while faded, so the pointer can reach it
                  className="absolute -right-11 top-0 bottom-0 hidden w-11 sm:flex items-center justify-center text-(--c-t-9a9a9a) opacity-0 transition-opacity hover:text-(--c-t-b42318) focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <IconTrash />
                </button>
              </div>
            );
          })
        )}
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function AccountButton({ initial, email }: { initial: string; email: string }) {
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="absolute right-5 top-6 sm:right-10">
      <button
        type="button"
        aria-label="Account"
        onClick={() => setOpen(!open)}
        className="h-9 w-9 rounded-full border border-(--c-l-dcdcdc) bg-(--c-b-ffffff) text-[14px] font-semibold text-(--c-t-1b1b1b)"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-64 rounded-xl border border-(--c-l-ebebeb) bg-(--c-b-ffffff) p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.10)]">
          <div className="truncate px-2 py-2 text-[13px] text-(--c-t-737373)">{email}</div>
          <div className="px-1 pb-2 pt-0.5">
            <div className="mb-1.5 px-1 text-[12px] text-(--c-t-9a9a9a)">Appearance</div>
            <ThemeToggle />
          </div>
          <div className="mx-1 mb-1 h-px bg-(--c-b-ebebeb)" />
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-[34px] w-full items-center rounded-md px-2 text-left text-[14px] text-(--c-t-1b1b1b) hover:bg-(--c-b-f4f4f4)"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
