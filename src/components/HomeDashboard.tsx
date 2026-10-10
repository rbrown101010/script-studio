"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { statusOf } from "@/lib/types";
import { FormatIcon } from "./FormatIcon";
import { openCommandPalette } from "./CommandPalette";
import { useHomeView, type View } from "./HomeSidebar";
import { IconSearch } from "./icons";

/**
 * Home: a search box that opens the ⌘K switcher, then what matters right now: anything urgent,
 * scripts in production, what goes live next, the YouTube channel, the latest updates and the best
 * topic ideas. Everything is read from the same queries the other pages use.
 */

/** [id, title, publishedAt, seconds, views, likes, comments], as in public/data/youtube.json */
type YTRow = [string, string, string, number, number, number, number];
type YTData = { updatedAt: string; channel: { subscribers: number; views: number; videos: number }; videos: YTRow[] };

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n);

const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Today", "Tomorrow", "Thu, Oct 9" */
function dayLabel(iso: string, today: string, tomorrow: string) {
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function HomeDashboard() {
  const { setView } = useHomeView();
  const me = useQuery(api.users.me);
  const videos = useQuery(api.videos.list);
  const feed = useQuery(api.updates.feed, { limit: 30 });
  const topics = useQuery(api.topics.list);
  const [yt, setYt] = useState<YTData | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    fetch("/data/youtube.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setYt)
      .catch(() => {});
  }, []);

  const go = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("home-view", v);
    } catch {}
    window.scrollTo({ top: 0 });
  };

  const name = me?.name?.trim().split(/\s+/)[0] || "";
  const hour = now?.getHours() ?? 12;
  const greeting = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${name ? `, ${name}` : ""}`;

  const today = now ? localIso(now) : "";
  const tomorrow = now ? localIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) : "";

  const inProduction = (videos ?? [])
    .filter((v) => statusOf(v.status).value === "inProduction")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const comingUp = (videos ?? [])
    .filter((v) => v.liveDate && v.liveDate >= today && statusOf(v.status).value !== "done")
    .sort((a, b) => a.liveDate!.localeCompare(b.liveDate!));
  const urgent = (feed ?? []).filter((u) => u.urgent).sort((a, b) => b.happenedAt - a.happenedAt);
  const latest = (feed ?? []).filter((u) => !u.urgent).slice(0, 5);
  const ideas = (topics ?? []).filter((t) => t.status === "new" || t.status === "saved").slice(0, 5);

  return (
    <div className="mx-auto max-w-[960px] px-5 pb-28">
      <h1 className="m-0 pt-[9vh] text-center text-[30px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">
        {me === undefined ? " " : greeting}
      </h1>
      <button
        type="button"
        onClick={openCommandPalette}
        className="mx-auto mt-6 flex h-12 w-full max-w-[560px] items-center gap-3 rounded-xl bg-(--c-card) px-4 text-left text-[15px] text-(--c-t-9a9a9a) shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-(--c-l-e3e3e0) transition-shadow hover:ring-(--c-l-c9c9c9)"
      >
        <IconSearch size={16} />
        <span className="flex-1">Search Native Note</span>
        <kbd className="hidden font-sans text-[12px] tracking-wide text-(--c-t-b0b0b0) sm:inline">⌘K</kbd>
      </button>

      {urgent.length > 0 && (
        <Section className="mt-14" title="Needs attention" count={urgent.length} tone="urgent" more={{ label: "Feed", run: () => go("feed") }}>
          {urgent.slice(0, 5).map((u) => (
            <Row key={u.id} href={`/v/${u.videoId}`} right={ago(u.happenedAt)}>
              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-(--c-t-b42318)" aria-hidden="true" />
              <span className="truncate text-(--c-t-1b1b1b)">{u.title}</span>
              <span className="hidden truncate text-(--c-t-9a9a9a) sm:inline">{u.videoTitle || "Untitled"}</span>
            </Row>
          ))}
        </Section>
      )}

      <div className={`grid grid-cols-1 gap-x-14 gap-y-12 md:grid-cols-2 ${urgent.length ? "mt-12" : "mt-14"}`}>
        <Section title="In production" count={videos ? inProduction.length : undefined} more={{ label: "Scripts", run: () => go("list") }}>
          {videos === undefined ? (
            <Loading />
          ) : inProduction.length === 0 ? (
            <Empty>Nothing in production.</Empty>
          ) : (
            inProduction.slice(0, 6).map((v) => (
              <Row key={v._id} href={`/v/${v._id}`} right={v.liveDate && now ? dayLabel(v.liveDate, today, tomorrow) : undefined}>
                <span className="flex w-4 shrink-0 justify-center text-(--c-t-8a8a8a)">
                  <FormatIcon format={v.format} size={14} />
                </span>
                <span className={`truncate ${v.title ? "text-(--c-t-1b1b1b)" : "text-(--c-t-9a9a9a)"}`}>{v.title || "Untitled"}</span>
                {v.editedCount > 0 && (
                  <span className="shrink-0 rounded-full bg-(--c-b-fdecea) px-2 py-px text-[11px] font-medium text-(--c-t-b42318)">Edited</span>
                )}
              </Row>
            ))
          )}
        </Section>

        <Section title="Coming up" more={{ label: "Calendar", run: () => go("calendar") }}>
          {videos === undefined || !now ? (
            <Loading />
          ) : comingUp.length === 0 ? (
            <Empty>Nothing scheduled.</Empty>
          ) : (
            comingUp.slice(0, 6).map((v) => {
              const st = statusOf(v.status);
              return (
                <Row key={v._id} href={`/v/${v._id}`} right={<span className="text-(--c-t-6b6b6b)">{dayLabel(v.liveDate!, today, tomorrow)}</span>}>
                  <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: st.dot }} title={st.label} aria-label={st.label} />
                  <span className={`truncate ${v.title ? "text-(--c-t-1b1b1b)" : "text-(--c-t-9a9a9a)"}`}>{v.title || "Untitled"}</span>
                </Row>
              );
            })
          )}
        </Section>

        <Section title="YouTube" more={{ label: "Open", run: () => go("youtube") }}>
          {yt && now ? <YouTubeSummary data={yt} now={now} /> : <Loading />}
        </Section>

        <Section title="Latest updates" more={{ label: "Feed", run: () => go("feed") }}>
          {feed === undefined ? (
            <Loading />
          ) : latest.length === 0 ? (
            <Empty>No updates yet.</Empty>
          ) : (
            latest.map((u) => (
              <Row key={u.id} href={`/v/${u.videoId}`} right={ago(u.happenedAt)}>
                <span className="min-w-0 truncate">
                  <span className="text-(--c-t-1b1b1b)">{u.title}</span>
                  <span className="text-(--c-t-9a9a9a)"> · {u.videoTitle || "Untitled"}</span>
                </span>
              </Row>
            ))
          )}
        </Section>

        <Section title="Topic ideas" more={{ label: "All topics", run: () => go("topics") }}>
          {topics === undefined ? (
            <Loading />
          ) : ideas.length === 0 ? (
            <Empty>No topic ideas yet.</Empty>
          ) : (
            ideas.map((t) => (
              <Row key={t.id} onClick={() => go("topics")} right={t.category}>
                <span className="w-7 shrink-0 text-[13px] font-semibold tabular-nums text-(--c-t-1b1b1b)" title="Opportunity score">
                  {t.score}
                </span>
                <span className="truncate text-(--c-t-1b1b1b)">{t.title}</span>
              </Row>
            ))
          )}
        </Section>
      </div>
    </div>
  );
}

/** Channel totals, views of the last 12 weeks' uploads (by the week they came out), and the newest videos */
function YouTubeSummary({ data, now }: { data: YTData; now: Date }) {
  const vids = data.videos.map(([id, title, published, , views]) => ({ id, title, published: new Date(published), views }));
  const monday = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  const thisWeek = monday(now);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(thisWeek);
    start.setUTCDate(start.getUTCDate() - 7 * (11 - i));
    const key = start.toISOString().slice(0, 10);
    const inWeek = vids.filter((v) => monday(v.published).toISOString().slice(0, 10) === key);
    return { key, start, views: inWeek.reduce((s, v) => s + v.views, 0), count: inWeek.length };
  });
  const max = Math.max(1, ...weeks.map((w) => w.views));
  const month = vids.filter((v) => now.getTime() - v.published.getTime() < 30 * 86400000);
  const newest = [...vids].sort((a, b) => b.published.getTime() - a.published.getTime()).slice(0, 3);
  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 px-2">
        <Stat value={fmt(data.channel.subscribers)} label="subscribers" />
        <Stat value={fmt(month.reduce((s, v) => s + v.views, 0))} label={`views on ${month.length} video${month.length === 1 ? "" : "s"} this month`} />
      </div>
      <div className="mt-4 flex h-16 items-end gap-1 px-2" aria-label="Views of each week's uploads, last 12 weeks" role="img">
        {weeks.map((w, i) => (
          <div
            key={w.key}
            className={`flex-1 rounded-t-[3px] ${i === weeks.length - 1 ? "bg-(--c-b-1b1b1b)" : "bg-(--c-b-dcdcdc)"}`}
            style={{ height: w.views ? `${Math.max(4, (w.views / max) * 100)}%` : 2 }}
            title={`Week of ${w.start.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}: ${w.count} video${w.count === 1 ? "" : "s"}, ${w.views.toLocaleString()} views`}
          />
        ))}
      </div>
      <div className="mt-3">
        {newest.map((v) => (
          <Row key={v.id} href={`https://www.youtube.com/watch?v=${v.id}`} external right={fmt(v.views)}>
            <span className="truncate text-(--c-t-1b1b1b)">{v.title}</span>
          </Row>
        ))}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[24px] font-semibold tracking-[-0.01em] text-(--c-t-1b1b1b)">{value}</span>
      <span className="text-[13px] text-(--c-t-737373)">{label}</span>
    </div>
  );
}

function Section({
  title,
  count,
  tone,
  more,
  className = "",
  children,
}: {
  title: string;
  count?: number;
  tone?: "urgent";
  more?: { label: string; run: () => void };
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`min-w-0 ${className}`}>
      <div className="mb-1.5 flex h-7 items-center gap-2 px-2">
        <h2 className={`m-0 text-[13px] font-medium ${tone === "urgent" ? "text-(--c-t-b42318)" : "text-(--c-t-737373)"}`}>{title}</h2>
        {count !== undefined && count > 0 && <span className="text-[12px] text-(--c-t-b0b0b0)">{count}</span>}
        {more && (
          <button type="button" onClick={more.run} className="ml-auto text-[12.5px] text-(--c-t-9a9a9a) hover:text-(--c-t-1b1b1b)">
            {more.label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

const rowCls = "flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[14px] no-underline hover:bg-(--c-b-f4f4f4)";

function Row({
  href,
  external,
  onClick,
  right,
  children,
}: {
  href?: string;
  external?: boolean;
  onClick?: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  const inner = (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {right !== undefined && <span className="shrink-0 whitespace-nowrap text-[12.5px] text-(--c-t-9a9a9a)">{right}</span>}
    </>
  );
  if (href && external)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={rowCls}>
        {inner}
      </a>
    );
  if (href)
    return (
      <Link href={href} className={rowCls}>
        {inner}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={rowCls}>
      {inner}
    </button>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-2 px-2 pt-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-(--c-b-f4f4f4)" style={{ width: `${80 - i * 15}%` }} />
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 px-2 py-2 text-[14px] text-(--c-t-9a9a9a)">{children}</p>;
}
