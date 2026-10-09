"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useIsMobile } from "@/lib/useIsMobile";
import { usePresence } from "@/lib/usePresence";
import { IconBoard, IconPin, IconPlus, IconSearch } from "./icons";
import { openCommandPalette } from "./CommandPalette";
import { FormatIcon } from "./FormatIcon";
import { ThemeToggle } from "./ThemeToggle";

export type View =
  | "home"
  | "list"
  | "calendar"
  | "kanban"
  | "feed"
  | "mymind"
  | "library"
  | "tweet"
  | "brands"
  | "boards"
  | "topics"
  | "youtube"
  | "weekly";
export type SponsorFilter = "all" | "sponsored" | "notSponsored";

export const SIDEBAR_WIDTH = 252;

/**
 * Whether the app sidebar is shown. Remembered per browser on computers (the same setting on every
 * page, so it stays put going from the Scripts list into a script); always starts closed on phones.
 */
function useSidebarState() {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(true);
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("home-sidebar") === "0") setOpen(false);
    } catch {}
    // No slide on the first paint (the saved state is applied then)
    const t = setTimeout(() => setAnimate(true), 300);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (mobile) setOpen(false);
  }, [mobile]);
  const toggle = (next: boolean) => {
    setOpen(next);
    if (!mobile)
      try {
        localStorage.setItem("home-sidebar", next ? "1" : "0");
      } catch {}
  };
  return { shown: open, mobile: !!mobile, animate, toggle };
}

type SidebarState = ReturnType<typeof useSidebarState>;
const Shell = createContext<{
  side: SidebarState;
  view: View;
  setView: (v: View) => void;
  /** The Scripts page swaps in its own New script (it starts one that matches its filters) */
  newScript: RefObject<(() => void) | null>;
} | null>(null);

/** The app sidebar's open/closed state (shared by every page inside the app shell) */
export function useAppSidebar(): SidebarState {
  const ctx = useContext(Shell);
  if (!ctx) throw new Error("useAppSidebar needs AppShell");
  return ctx.side;
}

/** The app sidebar's state, or null outside the app shell (share links) */
export function useMaybeAppSidebar(): SidebarState | null {
  return useContext(Shell)?.side ?? null;
}

/** The Scripts page's open view, kept in the shell so the sidebar can highlight it */
export function useHomeView() {
  const ctx = useContext(Shell);
  if (!ctx) throw new Error("useHomeView needs AppShell");
  return { view: ctx.view, setView: ctx.setView, newScript: ctx.newScript };
}

/**
 * Holds the sidebar for every signed-in page. It lives in the layout, so it stays mounted while you
 * move between scripts, boards and the Scripts page: no reloading, no flicker.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const side = useSidebarState();
  const [view, setView] = useState<View>("home");
  const newScript = useRef<(() => void) | null>(null);
  const pathname = usePathname();
  const active = pathname.match(/^\/(?:v|b)\/([^/]+)/)?.[1];
  const closeOnPhone = () => {
    if (side.mobile) side.toggle(false);
  };
  return (
    <Shell.Provider value={{ side, view, setView, newScript }}>
      <div className="relative flex min-h-screen bg-(--c-b-ffffff)">
        <SidebarFrame state={side}>
          <HomeSidebar
            view={pathname === "/" ? view : null}
            onView={
              pathname === "/"
                ? (v) => {
                    setView(v);
                    try {
                      localStorage.setItem("home-view", v);
                    } catch {}
                  }
                : undefined
            }
            onNewScript={pathname === "/" ? () => newScript.current?.() : undefined}
            onNavigate={closeOnPhone}
            activeId={active}
            onClose={() => side.toggle(false)}
          />
        </SidebarFrame>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Shell.Provider>
  );
}

/** Holds the sidebar: a column that slides open and shut on computers, a drawer over the page on phones */
export function SidebarFrame({
  state,
  children,
}: {
  state: ReturnType<typeof useAppSidebar>;
  children: ReactNode;
}) {
  const { shown, mobile, animate, toggle } = state;
  const drawer = usePresence(mobile && shown, 200);
  if (mobile)
    return drawer.mounted ? (
      <div className="fixed inset-0 z-50 flex">
        <aside
          className={`h-full w-[280px] max-w-[85vw] overflow-hidden bg-(--c-b-f9f9f8) shadow-[8px_0_30px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
            drawer.visible ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {children}
        </aside>
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => toggle(false)}
          className={`flex-1 bg-black/20 transition-opacity duration-200 ${drawer.visible ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    ) : null;
  return (
    // Width animates; the contents keep their width so nothing reflows while it slides
    <div
      aria-hidden={!shown}
      style={{ width: shown ? SIDEBAR_WIDTH : 0 }}
      className={`sticky top-0 h-screen shrink-0 overflow-hidden ${animate ? "transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]" : ""}`}
    >
      <aside
        inert={!shown}
        style={{ width: SIDEBAR_WIDTH }}
        className="h-full border-r border-(--c-l-ececec) bg-(--c-b-f9f9f8)"
      >
        {children}
      </aside>
    </div>
  );
}

/** The button that brings the sidebar back while it's hidden */
export function ShowSidebarButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Show sidebar"
      title="Show sidebar"
      className={`flex h-8 w-8 items-center justify-center rounded-md text-(--c-t-737373) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b) ${className}`}
    >
      <SidebarIcon />
    </button>
  );
}

/**
 * The app's left sidebar, the same on every page: search and New script, the script views, what's
 * pinned (scripts and boards), the apps, and your account at the bottom.
 */
export function HomeSidebar({
  view,
  onView,
  onClose,
  onNewScript,
  activeId,
  onNavigate,
}: {
  /** The open view on the Scripts page; null on other pages */
  view: View | null;
  /** Switch view on the Scripts page; elsewhere the sidebar opens the Scripts page at that view */
  onView?: (v: View) => void;
  onClose: () => void;
  onNewScript?: () => void;
  /** The script or board open right now, to highlight it under Pinned */
  activeId?: string;
  /** After any item is picked (closes the drawer on phones) */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pinned = useQuery(api.boards.pinned);
  const unpinScript = useMutation(api.videos.setPinned);
  const unpinBoard = useMutation(api.boards.setPinned);
  const create = useMutation(api.videos.create);
  const [creating, setCreating] = useState(false);

  const go = (v: View) => {
    onNavigate?.();
    if (onView) return onView(v);
    try {
      localStorage.setItem("home-view", v);
    } catch {}
    if (pathname === "/")
      window.dispatchEvent(new CustomEvent("native-note:view", { detail: v }));
    router.push(`/?view=${v}`);
  };
  const newScript = async () => {
    onNavigate?.();
    if (onNewScript) return onNewScript();
    setCreating(true);
    try {
      router.push(`/v/${await create({ format: "long" })}`);
    } finally {
      setCreating(false);
    }
  };
  const nav = (v: View, label: string, icon: ReactNode) => (
    <Item key={v} on={view === v} onClick={() => go(v)} icon={icon}>
      {label}
    </Item>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 pl-4 pr-2.5">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-(--c-b-1b1b1b) text-[12.5px] font-bold text-(--c-on-ink)"
        >
          N
        </span>
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-[-0.01em] text-(--c-t-1b1b1b)">
          Native Note
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide sidebar"
          title="Hide sidebar"
          className="flex h-7 w-7 items-center justify-center rounded-md text-(--c-t-9a9a9a) hover:bg-(--c-b-ececec) hover:text-(--c-t-1b1b1b)"
        >
          <SidebarIcon size={17} />
        </button>
      </div>

      <div className="flex flex-col gap-px px-2.5 pb-1">
        {nav("home", "Home", <HomeIcon />)}
        <Item
          on={false}
          onClick={openCommandPalette}
          icon={<IconSearch size={15} />}
          hint="⌘K"
        >
          Search
        </Item>
        <Item
          on={false}
          onClick={() => void newScript()}
          disabled={creating}
          icon={<IconPlus size={15} />}
        >
          New script
        </Item>
      </div>

      <nav
        aria-label="Sidebar"
        className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-3"
      >
        <Group label="Scripts">
          {nav("list", "All scripts", <ListIcon />)}
          {nav("calendar", "Calendar", <CalendarIcon />)}
          {nav("kanban", "Kanban", <KanbanIcon />)}
          {nav("feed", "Feed", <FeedIcon />)}
        </Group>

        {!!pinned?.length && (
          <Group label="Pinned">
            {pinned.map((p) => (
              <Item
                key={p.id}
                on={activeId === p.id}
                onClick={() => {
                  onNavigate?.();
                  if (activeId !== p.id)
                    router.push(p.kind === "board" ? `/b/${p.id}` : `/v/${p.id}`);
                }}
                icon={
                  p.kind === "board" ? (
                    <IconBoard size={15} />
                  ) : p.format ? (
                    <FormatIcon format={p.format} size={13} />
                  ) : (
                    <DocIcon />
                  )
                }
                action={{
                  label: `Unpin ${p.title || "Untitled"}`,
                  icon: <IconPin size={13} filled />,
                  run: () =>
                    p.kind === "board"
                      ? void unpinBoard({
                          id: p.id as Id<"boards">,
                          pinned: false,
                        })
                      : void unpinScript({
                          id: p.id as Id<"videos">,
                          pinned: false,
                        }),
                }}
              >
                {p.title.trim() ||
                  (p.kind === "board" ? "Untitled board" : "Untitled")}
              </Item>
            ))}
          </Group>
        )}

        <Group label="Apps">
          {nav("mymind", "Mymind", <MindIcon />)}
          {nav("library", "Library", <LibraryIcon />)}
          {nav("boards", "Excalidraw", <DrawIcon />)}
          {nav("tweet", "Tweet", <TweetIcon />)}
          {nav("brands", "Brand deals", <BrandIcon />)}
          {nav("topics", "Topic opportunities", <TrendIcon />)}
          {nav("youtube", "YouTube", <YouTubeIcon />)}
          {nav("weekly", "Weekly updates", <WeekIcon />)}
        </Group>
      </nav>

      <Account />
    </div>
  );
}

/** Bottom of the sidebar: who's signed in; opens appearance and sign out */
function Account() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const name = me?.name?.trim() || me?.email?.split("@")[0] || "";
  return (
    <div
      ref={ref}
      className="relative shrink-0 border-t border-(--c-l-ececec) p-2.5"
    >
      {open && (
        <div className="absolute bottom-[calc(100%-4px)] left-2.5 right-2.5 z-40 rounded-xl border border-(--c-l-ebebeb) bg-(--c-b-ffffff) p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
          <div className="truncate px-2 py-1.5 text-[12.5px] text-(--c-t-737373)">
            {me?.email}
          </div>
          <div className="px-1 pb-2 pt-0.5">
            <div className="mb-1.5 px-1 text-[12px] text-(--c-t-9a9a9a)">
              Appearance
            </div>
            <ThemeToggle />
          </div>
          <div className="mx-1 mb-1 h-px bg-(--c-b-ebebeb)" />
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-8 w-full items-center rounded-md px-2 text-left text-[13.5px] text-(--c-t-1b1b1b) hover:bg-(--c-b-f4f4f4)"
          >
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Account and appearance"
        className={`flex h-9 w-full items-center gap-2.5 rounded-md px-1.5 text-left ${open ? "bg-(--c-b-ececec)" : "hover:bg-(--c-b-efefed)"}`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--c-b-e6e6e3) text-[11.5px] font-semibold text-(--c-t-4a4a4a)">
          {(name || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-(--c-t-1b1b1b)">
          {name}
        </span>
        <svg
          viewBox="0 0 16 16"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-(--c-t-9a9a9a)"
          aria-hidden="true"
        >
          <path d="M5 6.5 8 3.5l3 3M5 9.5l3 3 3-3" />
        </svg>
      </button>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="mb-4 last:mb-0">
      <div className="flex h-7 items-center px-2 text-[12px] font-medium text-(--c-t-9a9a9a)">
        {label}
      </div>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}

function Item({
  on,
  onClick,
  icon,
  hint,
  action,
  disabled,
  children,
}: {
  on: boolean;
  onClick: () => void;
  icon?: ReactNode;
  hint?: string;
  /** A small button that shows on hover (e.g. unpin) */
  action?: { label: string; icon: ReactNode; run: () => void };
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="group/item relative">
      <button
        type="button"
        aria-current={on ? "page" : undefined}
        onClick={onClick}
        disabled={disabled}
        className={`flex h-[30px] w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] transition-colors duration-100 disabled:opacity-60 ${
          on
            ? "bg-(--c-b-e9e9e7) font-medium text-(--c-t-1b1b1b)"
            : "text-(--c-t-4a4a4a) hover:bg-(--c-b-efefed) hover:text-(--c-t-1b1b1b)"
        }`}
      >
        {icon && (
          <span
            className={`flex w-4 shrink-0 justify-center ${on ? "text-(--c-t-1b1b1b)" : "text-(--c-t-8a8a8a)"}`}
          >
            {icon}
          </span>
        )}
        <span
          className={`min-w-0 flex-1 truncate ${action ? "group-hover/item:pr-6" : ""}`}
        >
          {children}
        </span>
        {hint && (
          <span className="shrink-0 text-[11.5px] tracking-wide text-(--c-t-b0b0b0)">
            {hint}
          </span>
        )}
      </button>
      {action && (
        <button
          type="button"
          onClick={action.run}
          aria-label={action.label}
          title="Unpin"
          className="absolute right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-(--c-t-8a8a8a) hover:bg-(--c-b-e6e6e3) hover:text-(--c-t-1b1b1b) group-hover/item:flex group-focus-within/item:flex pointer-coarse:flex"
        >
          {action.icon}
        </button>
      )}
    </div>
  );
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 7 8 2.5 13.5 7v6.25a.5.5 0 0 1-.5.5H9.75V10h-3.5v3.75H3a.5.5 0 0 1-.5-.5V7Z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 1.75h5.5L12.75 5v9.25H4z" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12l4-4 2.5 2.5L14 5" />
      <path d="M10 5h4v4" />
    </svg>
  );
}

function WeekIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2.75" width="12" height="11" rx="2" />
      <path d="M2 6.25h12M5.25 1.5v2.5M10.75 1.5v2.5" />
      <path d="M4.5 9.25h7" strokeWidth="2.25" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2.5" />
      <path d="M6.75 6v4l3.5-2-3.5-2Z" fill="currentColor" />
    </svg>
  );
}

function DrawIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.5 2.5l3 3-7.5 7.5H3v-3L10.5 2.5Z" />
      <path d="M2.5 14.5c2-1.2 4-.2 6 .3s3.5.2 5-1" />
    </svg>
  );
}

export function SidebarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.5" />
      <path d="M7.75 3.75v12.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
    </svg>
  );
}

function MindIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2.25" y="2.25" width="4.5" height="6.5" rx="1.2" />
      <rect x="9.25" y="2.25" width="4.5" height="4" rx="1.2" />
      <rect x="2.25" y="11.25" width="4.5" height="2.5" rx="1.2" />
      <rect x="9.25" y="8.75" width="4.5" height="5" rx="1.2" />
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.25 8.6V3.25a1 1 0 0 1 1-1H8.6l5.15 5.15a1 1 0 0 1 0 1.41l-4.94 4.94a1 1 0 0 1-1.41 0L2.25 8.6Z" />
      <circle cx="5.5" cy="5.5" r="1" />
    </svg>
  );
}

function TweetIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9.47 6.77 14.3 1.25h-1.15L8.96 6.04 5.62 1.25H1.75l5.07 7.28-5.07 5.82H2.9l4.43-5.09 3.54 5.09h3.87L9.47 6.77Zm-1.57 1.8-.51-.72-4.08-5.76h1.76l3.29 4.65.51.72 4.28 6.05h-1.76L7.9 8.57Z" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" />
      <path d="M2.5 11l3.2-3.2 2.8 2.8 1.8-1.8 3.2 3.2" />
      <circle cx="10.25" cy="5.5" r="1" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 3.5h10M3 8h10M3 12.5h6" />
      <circle cx="12.5" cy="12.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
      <path d="M2.25 6.75h11.5M5.5 1.75v3M10.5 1.75v3" />
    </svg>
  );
}

function KanbanIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.75" y="2.25" width="3.5" height="11.5" rx="1" />
      <rect x="6.25" y="2.25" width="3.5" height="8" rx="1" />
      <rect x="10.75" y="2.25" width="3.5" height="5" rx="1" />
    </svg>
  );
}
