"use client";

import type { ReactNode } from "react";
import { IconSearch } from "./icons";
import { openCommandPalette } from "./CommandPalette";

export type View = "list" | "calendar" | "feed" | "mymind" | "library" | "tweet" | "brands" | "boards" | "topics";
export type SponsorFilter = "all" | "sponsored" | "notSponsored";

/** Left sidebar on the Scripts page: search, the script views, and the apps. */
export function HomeSidebar({
  search,
  onSearch,
  view,
  onView,
  onClose,
}: {
  search: string;
  onSearch: (s: string) => void;
  view: View;
  onView: (v: View) => void;
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
        <button
          type="button"
          onClick={openCommandPalette}
          title="Jump to any script, board or page"
          className="shrink-0 rounded-md border border-(--c-l-e3e3e0) px-1.5 py-0.5 text-[11px] text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
        >
          ⌘K
        </button>
      </label>

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
      </Group>

      <Group label="Apps">
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
        <Item on={view === "boards"} onClick={() => onView("boards")} icon={<DrawIcon />}>
          Excalidraw
        </Item>
        <Item on={view === "topics"} onClick={() => onView("topics")} icon={<TrendIcon />}>
          Topic opportunities
        </Item>
      </Group>
    </div>
  );
}

function TrendIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12l4-4 2.5 2.5L14 5" />
      <path d="M10 5h4v4" />
    </svg>
  );
}

function DrawIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 2.5l3 3-7.5 7.5H3v-3L10.5 2.5Z" />
      <path d="M2.5 14.5c2-1.2 4-.2 6 .3s3.5.2 5-1" />
    </svg>
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
