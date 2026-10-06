"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * YouTube: the channel's videos grouped by week, month or year. The numbers come from
 * public/data/youtube.json, which Claude refreshes every week from YouTube (via Composio)
 * with scripts/youtube-refresh.py; each refresh also keeps a snapshot so views gained per
 * week can be shown, and a short written report.
 */

/** [id, title, publishedAt, seconds, views, likes, comments] */
type Row = [string, string, string, number, number, number, number];
type Snapshot = { week: string; date: string; subscribers: number; views: number; videoViews: Record<string, number> };
type Data = {
  updatedAt: string;
  channel: { id: string; title: string; handle: string | null; subscribers: number; views: number; videos: number };
  videos: Row[];
  snapshots: Snapshot[];
  reports: { week: string; text: string }[];
};
type Video = { id: string; title: string; published: Date; seconds: number; views: number; likes: number; comments: number; short: boolean; gained: number | null };
type Grain = "week" | "month" | "year";
type Kind = "all" | "long" | "short";
type SortKey = "published" | "views" | "likes" | "comments" | "gained";

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n);
const full = (n: number) => n.toLocaleString();
const length = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The period a date falls in: weeks start on Monday (UTC), like the weekly refresh */
function periodOf(d: Date, grain: Grain) {
  if (grain === "year") return String(d.getUTCFullYear());
  if (grain === "month") return iso(d).slice(0, 7);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return iso(monday);
}
/** The period before `key` (to fill in weeks or months with no videos) */
function previous(key: string, grain: Grain) {
  if (grain === "year") return String(Number(key) - 1);
  if (grain === "month") {
    const [y, m] = key.split("-").map(Number);
    return iso(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7);
  }
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return iso(d);
}
function label(key: string, grain: Grain, short = false) {
  if (grain === "year") return key;
  if (grain === "month")
    return new Date(`${key}-01T00:00:00Z`).toLocaleDateString(undefined, { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" });
  const d = new Date(`${key}T00:00:00Z`);
  const md = d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return short ? md : `Week of ${md}, ${d.getUTCFullYear()}`;
}
const BARS: Record<Grain, number> = { week: 16, month: 12, year: 10 };

export function YouTubeApp() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [grain, setGrain] = useState<Grain>("week");
  const [kind, setKind] = useState<Kind>("all");
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/youtube.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
    try {
      const p = JSON.parse(localStorage.getItem("youtube-prefs") ?? "{}");
      if (["week", "month", "year"].includes(p.grain)) setGrain(p.grain);
      if (["all", "long", "short"].includes(p.kind)) setKind(p.kind);
    } catch {}
  }, []);
  const save = (next: { grain?: Grain; kind?: Kind }) => {
    if (next.grain) {
      setGrain(next.grain);
      setPicked(null);
    }
    if (next.kind) setKind(next.kind);
    try {
      localStorage.setItem("youtube-prefs", JSON.stringify({ grain: next.grain ?? grain, kind: next.kind ?? kind }));
    } catch {}
  };

  const snaps = data?.snapshots ?? [];
  const last = snaps.at(-1);
  const before = snaps.at(-2);
  const videos: Video[] = useMemo(
    () =>
      (data?.videos ?? [])
        .map(([id, title, published, seconds, views, likes, comments]) => ({
          id,
          title,
          published: new Date(published),
          seconds,
          views,
          likes,
          comments,
          // YouTube doesn't say which uploads are Shorts; anything three minutes or under counts
          short: seconds > 0 && seconds <= 180,
          gained: before ? views - (before.videoViews[id] ?? 0) : null,
        }))
        .filter((v) => kind === "all" || (kind === "short") === v.short),
    [data, kind, before],
  );

  const periods = useMemo(() => {
    const map = new Map<string, Video[]>();
    for (const v of videos) {
      const k = periodOf(v.published, grain);
      map.set(k, [...(map.get(k) ?? []), v]);
    }
    // The latest N periods, counting empty ones, so gaps show as gaps
    const out: { key: string; videos: Video[]; views: number }[] = [];
    let key = periodOf(new Date(), grain);
    const oldest = videos.length ? periodOf(videos[videos.length - 1].published, grain) : key;
    while (out.length < BARS[grain] && key >= oldest) {
      const vs = map.get(key) ?? [];
      out.unshift({ key, videos: vs, views: vs.reduce((s, v) => s + v.views, 0) });
      key = previous(key, grain);
    }
    return out;
  }, [videos, grain]);

  // Until a bar is picked, show the last full week / month / year (the current one is still filling up)
  const current = periods.find((p) => p.key === picked) ?? periods.at(-2) ?? periods.at(-1);
  const report = data?.reports.at(-1);

  if (failed) return <p className="mt-16 text-center text-[14px] text-(--c-t-8a8a8a)">Couldn’t load the YouTube numbers. Try reloading.</p>;

  return (
    <div className="mx-auto max-w-[1080px]">
      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="m-0 w-full text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b) sm:w-auto sm:flex-1">YouTube</h1>
        <Segmented value={grain} onChange={(g) => save({ grain: g })} options={[["week", "Week"], ["month", "Month"], ["year", "Year"]]} />
        <Segmented value={kind} onChange={(k) => save({ kind: k })} options={[["all", "All"], ["long", "Long"], ["short", "Shorts"]]} />
      </div>

      {!data ? (
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-lg bg-(--c-b-ececea)" />
          <div className="h-[220px] animate-pulse rounded-lg bg-(--c-b-ececea)" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
            <Stat label="Subscribers" value={fmt(data.channel.subscribers)} change={last && before ? last.subscribers - before.subscribers : null} title={full(data.channel.subscribers)} />
            <Stat label="Channel views" value={fmt(data.channel.views)} change={last && before ? last.views - before.views : null} title={full(data.channel.views)} />
            <Stat label="Public videos" value={String(data.channel.videos)} />
            <Stat label="Updated" value={new Date(data.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} title={new Date(data.updatedAt).toLocaleString()} />
          </div>

          {report && (
            <section className="mt-10 max-w-[720px]">
              <h2 className="m-0 text-[15px] font-semibold text-(--c-t-1b1b1b)">{label(report.week, "week")}</h2>
              <p className="mb-0 mt-1.5 text-[15px] leading-[1.6] text-(--c-t-4a4a4a)">{report.text}</p>
              {data.reports.length > 1 && <EarlierReports reports={data.reports.slice(0, -1)} />}
            </section>
          )}

          <section className="mt-10">
            <h2 className="m-0 text-[15px] font-semibold text-(--c-t-1b1b1b)">Views on videos published each {grain}</h2>
            <Bars periods={periods} grain={grain} selected={current?.key} onPick={setPicked} />
          </section>

          {current && <Period period={current} grain={grain} showGained={!!before} />}
        </>
      )}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" className="inline-flex h-8 items-center rounded-lg bg-(--c-b-ececea) p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-7 rounded-md px-3 text-[13px] font-medium transition-colors ${
            value === v ? "bg-(--c-b-ffffff) text-(--c-t-1b1b1b) shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, change, title }: { label: string; value: string; change?: number | null; title?: string }) {
  return (
    <div title={title}>
      <div className="text-[13px] text-(--c-t-8a8a8a)">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold tabular-nums tracking-[-0.01em] text-(--c-t-1b1b1b)">{value}</span>
        {change != null && change !== 0 && (
          <span className={`text-[13px] font-medium tabular-nums ${change > 0 ? "text-[#15803d] dark:text-[#6ee7a0]" : "text-[#b42318] dark:text-[#ff8a80]"}`}>
            {change > 0 ? "+" : "−"}
            {fmt(Math.abs(change))} this week
          </span>
        )}
      </div>
    </div>
  );
}

function EarlierReports({ reports }: { reports: { week: string; text: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-[13px] font-medium text-(--c-t-737373) hover:text-(--c-t-1b1b1b)">
        {open ? "Hide earlier weeks" : `Earlier weeks (${reports.length})`}
      </button>
      {open &&
        [...reports].reverse().map((r) => (
          <div key={r.week} className="mt-4">
            <h3 className="m-0 text-[14px] font-semibold text-(--c-t-1b1b1b)">{label(r.week, "week")}</h3>
            <p className="mb-0 mt-1 text-[14.5px] leading-[1.6] text-(--c-t-4a4a4a)">{r.text}</p>
          </div>
        ))}
    </>
  );
}

/** One bar per period; hover for the numbers, click to list that period's videos */
function Bars({ periods, grain, selected, onPick }: { periods: { key: string; videos: Video[]; views: number }[]; grain: Grain; selected?: string; onPick: (k: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...periods.map((p) => p.views));
  const shown = periods.find((p) => p.key === hover);
  // Label every bar when there's room, every other one on wide screens, a few on phones
  const every = periods.length > 12 ? 2 : 1;
  const everyPhone = Math.ceil(periods.length / 4);
  return (
    <div className="relative mt-4">
      <div className="flex h-[200px] items-end gap-[2px] sm:gap-1.5" onMouseLeave={() => setHover(null)}>
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPick(p.key)}
            onMouseEnter={() => setHover(p.key)}
            onFocus={() => setHover(p.key)}
            onBlur={() => setHover(null)}
            aria-label={`${label(p.key, grain)}: ${full(p.views)} views on ${p.videos.length} videos`}
            aria-pressed={selected === p.key}
            className="flex h-full min-w-0 flex-1 items-end"
          >
            <span
              className={`block w-full rounded-t-[4px] transition-colors ${selected === p.key ? "bg-(--c-b-1b1b1b)" : hover === p.key ? "bg-(--c-l-8a8a8a)" : "bg-(--c-b-dcdcdc)"}`}
              style={{ height: p.views ? `${Math.max(2, (p.views / max) * 100)}%` : 2 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-[2px] sm:gap-1.5">
        {periods.map((p, i) => (
          <span key={p.key} className={`min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11.5px] tabular-nums ${selected === p.key ? "font-medium text-(--c-t-1b1b1b)" : "text-(--c-t-9a9a9a)"}`}>
            <span className={(periods.length - 1 - i) % everyPhone === 0 ? "" : (periods.length - 1 - i) % every === 0 ? "hidden sm:inline" : "hidden"}>
              {label(p.key, grain, true)}
            </span>
          </span>
        ))}
      </div>
      {shown && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-(--c-b-ffffff) px-3 py-2 text-[12.5px] shadow-[0_6px_20px_rgba(0,0,0,0.12)] ring-1 ring-(--c-l-ebebeb)"
          style={{ left: `clamp(80px, ${((periods.indexOf(shown) + 0.5) / periods.length) * 100}%, calc(100% - 80px))` }}
        >
          <div className="font-medium text-(--c-t-1b1b1b)">{label(shown.key, grain)}</div>
          <div className="mt-0.5 tabular-nums text-(--c-t-737373)">
            {full(shown.views)} views · {shown.videos.length} {shown.videos.length === 1 ? "video" : "videos"}
          </div>
        </div>
      )}
    </div>
  );
}

function Period({ period, grain, showGained }: { period: { key: string; videos: Video[]; views: number }; grain: Grain; showGained: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "views", dir: -1 });
  const vs = [...period.videos].sort((a, b) => {
    const k = sort.key;
    const av = k === "published" ? a.published.getTime() : (a[k] ?? 0);
    const bv = k === "published" ? b.published.getTime() : (b[k] ?? 0);
    return (av - bv) * sort.dir;
  });
  const n = period.videos.length;
  const likes = period.videos.reduce((s, v) => s + v.likes, 0);
  const comments = period.videos.reduce((s, v) => s + v.comments, 0);
  const head = (key: SortKey, text: string, cls = "") => (
    <button
      type="button"
      onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : -1 })}
      className={`text-right text-[12.5px] font-medium hover:text-(--c-t-1b1b1b) ${sort.key === key ? "text-(--c-t-1b1b1b)" : "text-(--c-t-9a9a9a)"} ${cls}`}
    >
      {text}
      {sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
    </button>
  );
  const cols = showGained ? "sm:grid-cols-[minmax(0,1fr)_88px_72px_80px_80px_88px]" : "sm:grid-cols-[minmax(0,1fr)_88px_72px_80px_80px]";
  return (
    <section className="mt-12">
      <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em] text-(--c-t-1b1b1b)">{label(period.key, grain)}</h2>
      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
        <Stat label="Videos" value={String(n)} />
        <Stat label="Views" value={fmt(period.views)} title={full(period.views)} />
        <Stat label="Average per video" value={n ? fmt(Math.round(period.views / n)) : "0"} />
        <Stat label="Likes · comments" value={`${fmt(likes)} · ${fmt(comments)}`} />
      </div>

      {n === 0 ? (
        <p className="mt-8 text-[14px] text-(--c-t-8a8a8a)">Nothing published this {grain}.</p>
      ) : (
        <div className="mt-8">
          <div className={`hidden items-center gap-4 px-2 pb-2 sm:grid ${cols}`}>
            <span />
            {head("published", "Published")}
            <span className="text-right text-[12.5px] font-medium text-(--c-t-9a9a9a)">Length</span>
            {head("views", "Views")}
            {head("likes", "Likes")}
            {showGained && head("gained", "This week")}
          </div>
          {vs.map((v) => (
            <a
              key={v.id}
              href={`https://www.youtube.com/watch?v=${v.id}`}
              target="_blank"
              rel="noreferrer"
              className={`grid grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 hover:bg-(--c-b-efefec) ${cols}`}
            >
              <span className="flex min-w-0 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" className={`shrink-0 rounded-md object-cover ${v.short ? "h-[54px] w-[54px]" : "h-[54px] w-[96px]"}`} />
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[14px] font-medium leading-snug text-(--c-t-1b1b1b)">{v.title}</span>
                  <span className="mt-0.5 block text-[12.5px] tabular-nums text-(--c-t-9a9a9a) sm:hidden">
                    {fmt(v.views)} views · {fmt(v.likes)} likes · {v.published.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {showGained && v.gained ? ` · +${fmt(v.gained)} this week` : ""}
                  </span>
                </span>
              </span>
              <span className="hidden text-right text-[13px] tabular-nums text-(--c-t-737373) sm:block">
                {v.published.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              <span className="hidden text-right text-[13px] tabular-nums text-(--c-t-737373) sm:block">{length(v.seconds)}</span>
              <span className="hidden text-right text-[13.5px] font-medium tabular-nums text-(--c-t-1b1b1b) sm:block" title={full(v.views)}>
                {fmt(v.views)}
              </span>
              <span className="hidden text-right text-[13px] tabular-nums text-(--c-t-737373) sm:block" title={`${full(v.likes)} likes, ${full(v.comments)} comments`}>
                {fmt(v.likes)}
              </span>
              {showGained && (
                <span className="hidden text-right text-[13px] tabular-nums text-(--c-t-737373) sm:block">{v.gained ? `+${fmt(v.gained)}` : "—"}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
