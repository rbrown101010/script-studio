"use client";

import type { ReactNode } from "react";
import { FORMATS, STATUSES, type VideoFormat, type VideoStatus } from "@/lib/types";
import { FormatIcon } from "./FormatIcon";
import { IconPlus, IconSearch } from "./icons";

export type View = "list" | "calendar" | "feed" | "mymind" | "library" | "tweet" | "brands";
export type SponsorFilter = "all" | "sponsored" | "notSponsored";

type Counts = { status: Record<string, number>; sponsor: Record<SponsorFilter, number>; format: Record<string, number> };

/** Left sidebar on the Scripts page: search, new script, views and filters. */
export function HomeSidebar({
  search,
  onSearch,
  onNew,
  creating,
  view,
  onView,
  status,
  onStatus,
  sponsor,
  onSponsor,
  format,
  onFormat,
  counts,
  onClose,
}: {
  search: string;
  onSearch: (s: string) => void;
  onNew: () => void;
  creating: boolean;
  view: View;
  onView: (v: View) => void;
  status: "all" | VideoStatus;
  onStatus: (s: "all" | VideoStatus) => void;
  sponsor: SponsorFilter;
  onSponsor: (s: SponsorFilter) => void;
  format: "all" | VideoFormat;
  onFormat: (f: "all" | VideoFormat) => void;
  counts?: Counts;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-5 px-3 pb-6 pt-4">
      <div className="flex items-center justify-between pl-2">
        <span className="text-[15px] font-semibold text-(--c-t-1b1b1b)">Native Note</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide sidebar"
          title="Hide sidebar"
          className="flex h-8 w-8 items-center justify-center rounded-md text-(--c-t-737373) hover:bg-(--c-b-ececec) hover:text-(--c-t-1b1b1b)"
        >
          <SidebarIcon />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-(--c-l-e0e0e0) bg-(--c-b-ffffff) px-2.5 text-(--c-t-737373) focus-within:border-(--c-l-c9c9c9)">
          <IconSearch />
          <input
            id="sidebar-search"
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search scripts"
            aria-label="Search scripts"
            className="w-full border-none bg-transparent text-[14px] text-(--c-t-1b1b1b) outline-none"
          />
        </label>
        <button
          type="button"
          onClick={onNew}
          disabled={creating}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-3 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-50"
        >
          <IconPlus color="var(--c-on-ink)" />
          New script
        </button>
      </div>

      <Group label="Views">
        <Item on={view === "list"} onClick={() => onView("list")} icon={<ListIcon />}>
          List
        </Item>
        <Item on={view === "calendar"} onClick={() => onView("calendar")} icon={<CalendarIcon />}>
          Calendar
        </Item>
        <Item on={view === "feed"} onClick={() => onView("feed")} icon={<FeedIcon />}>
          Feed
        </Item>
        <Item on={view === "mymind"} onClick={() => onView("mymind")} icon={<MindIcon />}>
          Mymind
        </Item>
        <Item on={view === "library"} onClick={() => onView("library")} icon={<LibraryIcon />}>
          Library
        </Item>
        <Item on={view === "tweet"} onClick={() => onView("tweet")} icon={<TweetIcon />}>
          Tweet
        </Item>
        <Item on={view === "brands"} onClick={() => onView("brands")} icon={<BrandIcon />}>
          Brand deals
        </Item>
      </Group>

      {/* Filters are about scripts; Mymind has its own search */}
      {view !== "mymind" && view !== "library" && view !== "tweet" && view !== "brands" && view !== "feed" && (
      <>

      <Group label="Status">
        {[...STATUSES.map((s) => ({ value: s.value as "all" | VideoStatus, label: s.label, dot: s.dot })), { value: "all" as const, label: "All", dot: "" }].map((s) => (
          <Item
            key={s.value}
            on={status === s.value}
            onClick={() => onStatus(s.value)}
            icon={s.dot ? <span className="h-[7px] w-[7px] rounded-full" style={{ background: s.dot }} /> : <span className="h-[7px] w-[7px] rounded-full border border-(--c-l-c4c4c4)" />}
            count={counts?.status[s.value]}
          >
            {s.label}
          </Item>
        ))}
      </Group>

      <Group label="Sponsorship">
        {(
          [
            ["all", "All"],
            ["sponsored", "Sponsored"],
            ["notSponsored", "Not sponsored"],
          ] as const
        ).map(([value, label]) => (
          <Item key={value} on={sponsor === value} onClick={() => onSponsor(value)} count={counts?.sponsor[value]}>
            {label}
          </Item>
        ))}
      </Group>

      <Group label="Format">
        {(["all", "long", "short"] as const).map((f) => (
          <Item
            key={f}
            on={format === f}
            onClick={() => onFormat(f)}
            icon={f === "all" ? undefined : <FormatIcon format={f} size={12} />}
            count={counts?.format[f]}
          >
            {f === "all" ? "All" : FORMATS.find((x) => x.value === f)?.label}
          </Item>
        ))}
      </Group>
      </>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">{label}</div>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}

function Item({ on, onClick, icon, count, children }: { on: boolean; onClick: () => void; icon?: ReactNode; count?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[14px] ${
        on ? "bg-(--c-b-e9e9e7) font-medium text-(--c-t-1b1b1b)" : "text-(--c-t-4a4a4a) hover:bg-(--c-b-efefed)"
      }`}
    >
      {icon && <span className="flex w-4 shrink-0 justify-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && <span className="text-[12px] font-normal text-(--c-t-9a9a9a)">{count}</span>}
    </button>
  );
}

export function SidebarIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.5" />
      <path d="M7.75 3.75v12.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
    </svg>
  );
}

function MindIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2.25" y="2.25" width="4.5" height="6.5" rx="1.2" />
      <rect x="9.25" y="2.25" width="4.5" height="4" rx="1.2" />
      <rect x="2.25" y="11.25" width="4.5" height="2.5" rx="1.2" />
      <rect x="9.25" y="8.75" width="4.5" height="5" rx="1.2" />
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.25 8.6V3.25a1 1 0 0 1 1-1H8.6l5.15 5.15a1 1 0 0 1 0 1.41l-4.94 4.94a1 1 0 0 1-1.41 0L2.25 8.6Z" />
      <circle cx="5.5" cy="5.5" r="1" />
    </svg>
  );
}

function TweetIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M9.47 6.77 14.3 1.25h-1.15L8.96 6.04 5.62 1.25H1.75l5.07 7.28-5.07 5.82H2.9l4.43-5.09 3.54 5.09h3.87L9.47 6.77Zm-1.57 1.8-.51-.72-4.08-5.76h1.76l3.29 4.65.51.72 4.28 6.05h-1.76L7.9 8.57Z" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" />
      <path d="M2.5 11l3.2-3.2 2.8 2.8 1.8-1.8 3.2 3.2" />
      <circle cx="10.25" cy="5.5" r="1" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M3 3.5h10M3 8h10M3 12.5h6" />
      <circle cx="12.5" cy="12.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
      <path d="M2.25 6.75h11.5M5.5 1.75v3M10.5 1.75v3" />
    </svg>
  );
}
