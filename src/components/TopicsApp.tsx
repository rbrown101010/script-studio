"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { IconCheck, IconChevron, IconCopy, IconSearch } from "./icons";

type Topic = NonNullable<ReturnType<typeof useQuery<typeof api.topics.list>>>[number];
type Level = "high" | "medium" | "low";
type Tab = "ideas" | "saved" | "archive";

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const ytId = (url: string) => url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? null;
/** How many times the channel's usual views a video got (only when both numbers are known) */
const multiple = (o: Topic["outliers"][number]) => (o.views && o.channelAvgViews ? o.views / o.channelAvgViews : null);

/** Score as a small ring: green for strong, amber for decent, grey otherwise */
function ScoreRing({ score, size = 40 }: { score: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "#16a34a" : score >= 55 ? "#d97706" : "#9a9a9a";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title={`Opportunity score ${score} / 100`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-l-ebebeb)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className="absolute text-[13px] font-semibold tabular-nums text-(--c-t-1b1b1b)">{score}</span>
    </span>
  );
}

/** Three little bars: how much of something (demand) or how crowded (competition) */
function Meter({ level, invert }: { level: Level; invert?: boolean }) {
  const n = level === "high" ? 3 : level === "medium" ? 2 : 1;
  // For demand more is good (green); for competition more is bad (red)
  const good = invert ? n === 1 : n === 3;
  const bad = invert ? n === 3 : n === 1;
  const color = good ? "#16a34a" : bad ? (invert ? "#dc2626" : "#9a9a9a") : "#d97706";
  return (
    <span className="inline-flex items-end gap-[2px]" aria-label={level}>
      {[1, 2, 3].map((i) => (
        <span key={i} className="w-[4px] rounded-[1px]" style={{ height: 4 + i * 3, background: i <= n ? color : "var(--c-l-e3e3e0)" }} />
      ))}
    </span>
  );
}

const TREND: Record<Topic["trend"], { label: string; cls: string }> = {
  breakout: { label: "Breakout", cls: "bg-[#fde8e8] text-[#b42318] dark:bg-[#3a1a1a] dark:text-[#ff8a80]" },
  rising: { label: "Rising", cls: "bg-[#e7f6ec] text-[#15803d] dark:bg-[#15291c] dark:text-[#6ee7a0]" },
  steady: { label: "Steady", cls: "bg-(--c-b-f4f4f4) text-(--c-t-737373)" },
  falling: { label: "Cooling", cls: "bg-(--c-b-f4f4f4) text-(--c-t-9a9a9a)" },
};

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium ${className}`}>{children}</span>;
}

/**
 * Topic opportunities: researched YouTube video ideas, best first. Each row shows the signals that matter
 * (score, trend, demand, competition, best outlier); open one to read the evidence and act on it.
 */
export function TopicsApp() {
  const latest = useQuery(api.topics.list);
  const runs = useQuery(api.topics.runs);
  /** An earlier research run to look at (null = the latest research) */
  const [runView, setRunView] = useState<string | null>(null);
  const past = useQuery(api.topics.asOf, runView ? { run: runView as Id<"topicRuns"> } : "skip");
  const topics = runView ? past : latest;
  const shownRun = runView ? runs?.find((r) => r.id === runView) : runs?.[0];
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("ideas");
  const [format, setFormat] = useState<"all" | "long" | "short">("all");
  const [category, setCategory] = useState<string>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const counts = useMemo(() => {
    const t = topics ?? [];
    return {
      ideas: t.filter((x) => x.status === "new" || x.status === "saved").length,
      saved: t.filter((x) => x.status === "saved").length,
      archive: t.filter((x) => x.status === "used" || x.status === "dismissed").length,
    };
  }, [topics]);
  const categories = useMemo(() => [...new Set((topics ?? []).map((t) => t.category))].sort(), [topics]);
  const lastResearch = useMemo(() => Math.max(0, ...(topics ?? []).map((t) => t.researchedAt)), [topics]);

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (topics ?? []).filter((t) => {
      const inTab = tab === "ideas" ? t.status === "new" || t.status === "saved" : tab === "saved" ? t.status === "saved" : t.status === "used" || t.status === "dismissed";
      const fmtOk = format === "all" || t.format === format || t.format === "both";
      const hay = `${t.title} ${t.angle} ${t.keywords.map((k) => k.term).join(" ")}`.toLowerCase();
      return inTab && fmtOk && (category === "all" || t.category === category) && terms.every((w) => hay.includes(w));
    });
  }, [topics, tab, format, category, q]);

  return (
    <div className="mx-auto max-w-[920px]">
      <div className="mb-5">
        <h1 className="m-0 text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">Topic opportunities</h1>
        <p className="m-0 mt-1 text-[14px] text-(--c-t-8a8a8a)">
          What to make next, from YouTube search demand, competition and outlier videos.
          {lastResearch > 0 && !runView && ` Researched ${new Date(lastResearch).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`}
        </p>
      </div>

      {/* Every research run is kept: look back at any of them, and read what changed */}
      {runs && runs.length > 0 && (
        <div className={`mb-4 rounded-2xl px-4 py-3 ring-1 ${runView ? "bg-[#fff8e6] ring-[#f5d78e] dark:bg-[#2a2310] dark:ring-[#5c4a1a]" : "bg-(--c-b-fafaf9) ring-(--c-l-ebebeb)"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-(--c-t-1b1b1b)">{runView ? "Earlier research" : "Latest research"}</span>
            <select
              value={runView ?? ""}
              onChange={(e) => {
                setRunView(e.target.value || null);
                setOpen(null);
              }}
              aria-label="Research from"
              className="h-8 rounded-lg bg-(--c-b-ffffff) px-2 text-[13px] text-(--c-t-1b1b1b) outline-none ring-1 ring-(--c-l-e3e3e0)"
            >
              {runs.map((r, i) => (
                <option key={r.id} value={i === 0 ? "" : r.id}>
                  {new Date(r.startedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  {" · "}
                  {r.added ? `${r.added} new` : ""}
                  {r.added && r.refreshed ? ", " : ""}
                  {r.refreshed ? `${r.refreshed} updated` : ""}
                  {i === 0 ? " (latest)" : ""}
                </option>
              ))}
            </select>
            {runView && (
              <button type="button" onClick={() => setRunView(null)} className="h-8 rounded-lg px-2.5 text-[13px] font-medium text-(--c-t-2358d8) hover:bg-(--c-b-f4f4f4)">
                Back to latest
              </button>
            )}
            {shownRun?.summary && (
              <button
                type="button"
                onClick={() => setSummaryOpen(!summaryOpen)}
                aria-expanded={summaryOpen}
                className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)"
              >
                What changed
                <IconChevron open={summaryOpen} />
              </button>
            )}
          </div>
          {summaryOpen && shownRun?.summary && <p className="m-0 mt-2 whitespace-pre-wrap text-[14px] leading-[1.55] text-(--c-t-4a4a4a)">{shownRun.summary}</p>}
          {runView && <p className="m-0 mt-1.5 text-[12px] text-(--c-t-8a8a8a)">Scores and notes below are as they were then. Your marks are today&apos;s.</p>}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-lg bg-(--c-b-f4f4f4) p-0.5">
          {(
            [
              ["ideas", "Ideas"],
              ["saved", "Might do"],
              ["archive", "Archive"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`h-8 rounded-md px-3 text-[13px] font-medium ${tab === k ? "bg-(--c-b-ffffff) text-(--c-t-1b1b1b) shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"}`}
            >
              {label}
              <span className="ml-1.5 tabular-nums text-(--c-t-9a9a9a)">{counts[k]}</span>
            </button>
          ))}
        </div>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
          aria-label="Format"
          className="h-9 rounded-lg bg-(--c-b-f4f4f4) px-2.5 text-[13px] text-(--c-t-1b1b1b) outline-none"
        >
          <option value="all">Long and short</option>
          <option value="long">Long-form</option>
          <option value="short">Shorts</option>
        </select>
        {categories.length > 1 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            className="h-9 rounded-lg bg-(--c-b-f4f4f4) px-2.5 text-[13px] text-(--c-t-1b1b1b) outline-none"
          >
            <option value="all">All kinds</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <label className="ml-auto flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg bg-(--c-b-f4f4f4) px-2.5 text-(--c-t-9a9a9a) sm:max-w-[260px]">
          <IconSearch size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search topics and keywords"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
          />
        </label>
      </div>

      {!topics ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-(--c-b-f4f4f4)" />
          ))}
        </div>
      ) : !shown.length ? (
        <p className="mt-16 text-center text-[14px] text-(--c-t-8a8a8a)">
          {!topics.length
            ? "No research yet. Ask Claude to research topics for the channel and they'll show up here."
            : tab === "saved"
              ? "Nothing marked yet. Tap Might do on the ideas you'd make."
              : tab === "archive"
                ? "Topics you dismiss or turn into scripts land here."
                : "No topics match."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((t) => (
            <TopicRow key={t.id} topic={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TopicRow({ topic: t, open, onToggle }: { topic: Topic; open: boolean; onToggle: () => void }) {
  const update = useMutation(api.topics.update);
  const best = t.outliers.map(multiple).reduce<number | null>((m, x) => (x !== null && (m === null || x > m) ? x : m), null);
  const saved = t.status === "saved";
  const archived = t.status === "used" || t.status === "dismissed";
  return (
    <div className={`overflow-hidden rounded-2xl bg-(--c-b-ffffff) ring-1 transition-shadow ${open ? "ring-(--c-l-dcdcdc) shadow-[0_8px_28px_rgba(0,0,0,0.07)]" : "ring-(--c-l-ebebeb) hover:ring-(--c-l-dcdcdc)"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
          <ScoreRing score={t.score} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[15px] font-medium text-(--c-t-1b1b1b)">{t.title}</span>
              {t.isNew && <span className="shrink-0 rounded-full bg-[#2358d8] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.04em] text-white">New</span>}
              {t.prevScore !== null && t.prevScore !== t.score && (
                <span
                  title={`Was ${t.prevScore} in the research before`}
                  className={`shrink-0 text-[12px] font-medium tabular-nums ${t.score > t.prevScore ? "text-[#15803d] dark:text-[#6ee7a0]" : "text-[#b42318] dark:text-[#ff8a80]"}`}
                >
                  {t.score > t.prevScore ? "↑" : "↓"}
                  {Math.abs(t.score - t.prevScore)}
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <Chip className={TREND[t.trend].cls}>{TREND[t.trend].label}</Chip>
              <Chip className="bg-(--c-b-f4f4f4) text-(--c-t-6b6b6b)">
                Demand <Meter level={t.demand} />
              </Chip>
              <Chip className="bg-(--c-b-f4f4f4) text-(--c-t-6b6b6b)">
                Competition <Meter level={t.competition} invert />
              </Chip>
              {best !== null && best >= 2 && <Chip className="bg-[#eef2ff] text-[#3b47c4] dark:bg-[#1c2140] dark:text-[#a5b4fc]">{best.toFixed(best >= 10 ? 0 : 1)}× outlier</Chip>}
              <span className="hidden truncate text-[12px] text-(--c-t-9a9a9a) sm:inline">
                {t.category} · {t.format === "both" ? "Long + short" : t.format === "short" ? "Short" : "Long-form"}
                {t.status === "used" ? " · Made into a script" : t.status === "dismissed" ? " · Dismissed" : ""}
              </span>
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void update({ id: t.id, status: saved ? "new" : "saved" })}
          aria-pressed={saved}
          title={saved ? "Marked: you might make this (tap to unmark)" : "Mark as something you might make"}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium ${
            saved ? "bg-[#fff4cc] text-[#9a6b00] dark:bg-[#3a2f0d] dark:text-[#f5c542]" : "text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
          } ${archived ? "hidden" : ""}`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
          </svg>
          <span className="hidden sm:inline">Might do</span>
        </button>
        <button type="button" onClick={onToggle} aria-label={open ? "Collapse" : "Expand"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4)">
          <IconChevron open={open} />
        </button>
      </div>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">{open && <TopicDetail topic={t} />}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-(--c-t-9a9a9a)">{title}</h3>
      {children}
    </section>
  );
}

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <li className="group/copy flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-(--c-b-f4f4f4)">
      <span className="min-w-0 flex-1 text-[14px] leading-[1.45] text-(--c-t-1b1b1b)">{text}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }}
        aria-label="Copy"
        className="mt-0.5 shrink-0 text-(--c-t-9a9a9a) opacity-0 hover:text-(--c-t-1b1b1b) group-hover/copy:opacity-100 pointer-coarse:opacity-100"
      >
        {done ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </button>
    </li>
  );
}

function TopicDetail({ topic: t }: { topic: Topic }) {
  const update = useMutation(api.topics.update);
  const createVideo = useMutation(api.videos.create);
  const updateVideo = useMutation(api.videos.update);
  const router = useRouter();
  const [notes, setNotes] = useState(t.notes);
  const [making, setMaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  /** New script (status Idea) with this topic as its brief, then open it */
  const makeScript = async () => {
    setMaking(true);
    try {
      const id = await createVideo({ format: t.format === "short" ? "short" : "long", status: "idea" });
      const brief = [
        t.angle,
        "",
        `Why now: ${t.whyNow}`,
        t.keywords.length ? `\nKeywords: ${t.keywords.map((k) => k.term).join(", ")}` : "",
        t.titleIdeas.length ? `\nTitle ideas:\n${t.titleIdeas.map((x) => `- ${x}`).join("\n")}` : "",
        t.hooks.length ? `\nHooks:\n${t.hooks.map((x) => `- ${x}`).join("\n")}` : "",
        t.notes ? `\nNotes: ${t.notes}` : "",
      ]
        .filter((x) => x !== "")
        .join("\n");
      const links = [
        ...t.outliers.map((o) => ({ label: `Outlier: ${o.title}`.slice(0, 200), url: o.url })),
        ...t.sources.map((s) => ({ label: s.label, url: s.url })),
      ]
        .filter((l, i, all) => all.findIndex((x) => x.url === l.url) === i)
        .slice(0, 30)
        .map((l) => ({ ...l, id: crypto.randomUUID() }));
      await updateVideo({ id, title: t.titleIdeas[0] ?? t.title, brief: brief.slice(0, 50000), briefLinks: links });
      await update({ id: t.id, status: "used", videoId: id });
      router.push(`/v/${id}`);
    } catch {
      setMaking(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 border-t border-(--c-l-ebebeb) px-4 pb-4 pt-4 sm:px-5">
      <p className="m-0 text-[15px] leading-[1.55] text-(--c-t-1b1b1b)">{t.angle}</p>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Why now">
          <p className="m-0 text-[14px] leading-[1.55] text-(--c-t-4a4a4a)">{t.whyNow}</p>
        </Section>
        <Section title="Signals">
          <div className="flex flex-col gap-2.5 text-[14px]">
            <div className="flex gap-2.5">
              <span className="mt-1">
                <Meter level={t.demand} />
              </span>
              <span className="min-w-0 text-(--c-t-4a4a4a)">
                <b className="font-medium capitalize text-(--c-t-1b1b1b)">{t.demand} demand.</b> {t.demandNote}
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="mt-1">
                <Meter level={t.competition} invert />
              </span>
              <span className="min-w-0 text-(--c-t-4a4a4a)">
                <b className="font-medium capitalize text-(--c-t-1b1b1b)">{t.competition} competition.</b> {t.competitionNote}
              </span>
            </div>
          </div>
        </Section>
      </div>

      {t.outliers.length > 0 && (
        <Section title="Outlier videos">
          <div className="grid gap-2 sm:grid-cols-2">
            {t.outliers.map((o) => {
              const id = ytId(o.url);
              const m = multiple(o);
              return (
                <a
                  key={o.url}
                  href={o.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-3 rounded-xl p-2 no-underline ring-1 ring-(--c-l-ebebeb) hover:bg-(--c-b-fafaf9) hover:ring-(--c-l-dcdcdc)"
                >
                  {id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="h-[63px] w-[112px] shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="h-[63px] w-[112px] shrink-0 rounded-lg bg-(--c-b-f4f4f4)" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="line-clamp-2 text-[13px] font-medium leading-[1.35] text-(--c-t-1b1b1b)">{o.title}</span>
                    <span className="truncate text-[12px] text-(--c-t-8a8a8a)">
                      {[o.channel, o.views ? `${fmt(o.views)} views` : null, o.published].filter(Boolean).join(" · ")}
                    </span>
                    {m !== null && (
                      <span className="text-[12px] font-medium text-[#3b47c4] dark:text-[#a5b4fc]">
                        {m.toFixed(m >= 10 ? 0 : 1)}× their usual {o.channelAvgViews ? `(${fmt(o.channelAvgViews)})` : ""}
                      </span>
                    )}
                    {o.note && <span className="line-clamp-2 text-[12px] text-(--c-t-737373)">{o.note}</span>}
                  </span>
                </a>
              );
            })}
          </div>
        </Section>
      )}

      {t.keywords.length > 0 && (
        <Section title="Keywords">
          <div className="overflow-hidden rounded-xl ring-1 ring-(--c-l-ebebeb)">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-(--c-b-fafaf9) text-left text-[12px] text-(--c-t-8a8a8a)">
                  <th className="px-3 py-2 font-medium">Search</th>
                  <th className="w-[84px] px-2 py-2 font-medium">Demand</th>
                  <th className="w-[100px] px-2 py-2 font-medium">Competition</th>
                </tr>
              </thead>
              <tbody>
                {t.keywords.map((k) => (
                  <tr key={k.term} className="border-t border-(--c-l-ebebeb) align-top">
                    <td className="px-3 py-2 text-(--c-t-1b1b1b)">
                      {k.term}
                      {k.note && <div className="mt-0.5 text-[12px] text-(--c-t-8a8a8a)">{k.note}</div>}
                    </td>
                    <td className="px-2 py-2.5">{k.demand ? <Meter level={k.demand} /> : <span className="text-(--c-t-9a9a9a)">–</span>}</td>
                    <td className="px-2 py-2.5">{k.competition ? <Meter level={k.competition} invert /> : <span className="text-(--c-t-9a9a9a)">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {t.titleIdeas.length > 0 && (
          <Section title="Title ideas">
            <ul className="-mx-2 m-0 list-none p-0">
              {t.titleIdeas.map((x) => (
                <CopyLine key={x} text={x} />
              ))}
            </ul>
          </Section>
        )}
        {t.hooks.length > 0 && (
          <Section title="Hooks">
            <ul className="-mx-2 m-0 list-none p-0">
              {t.hooks.map((x) => (
                <CopyLine key={x} text={x} />
              ))}
            </ul>
          </Section>
        )}
      </div>

      {t.sources.length > 0 && (
        <Section title="Sources">
          <div className="flex flex-wrap gap-1.5">
            {t.sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="max-w-full truncate rounded-full bg-(--c-b-f4f4f4) px-2.5 py-1 text-[12px] text-(--c-t-4a4a4a) no-underline hover:text-(--c-t-1b1b1b)"
              >
                {s.label}
              </a>
            ))}
          </div>
        </Section>
      )}

      <TopicHistory id={t.id} />

      <Section title="Notes">
        <textarea
          value={notes}
          onChange={(e) => {
            const val = e.target.value;
            setNotes(val);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void update({ id: t.id, notes: val }), 600);
          }}
          rows={2}
          placeholder="Your take on this idea…"
          className="w-full resize-y rounded-xl bg-(--c-b-f4f4f4) px-3 py-2 text-[14px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a) focus:ring-2 focus:ring-(--c-l-dcdcdc)"
        />
      </Section>

      <div className="flex flex-wrap items-center gap-2">
        {t.videoId ? (
          <button
            type="button"
            onClick={() => router.push(`/v/${t.videoId}`)}
            className="inline-flex h-9 items-center rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[13px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333)"
          >
            Open its script
          </button>
        ) : (
          <button
            type="button"
            disabled={making}
            onClick={() => void makeScript()}
            className="inline-flex h-9 items-center rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[13px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-50"
          >
            {making ? "Making script…" : "Create script"}
          </button>
        )}
        {t.status === "dismissed" || t.status === "used" ? (
          <button
            type="button"
            onClick={() => void update({ id: t.id, status: "new" })}
            className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)"
          >
            Move back to ideas
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void update({ id: t.id, status: "dismissed" })}
            className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)"
          >
            Not for us
          </button>
        )}
        {t.addedBy && (
          <span className="ml-auto text-[12px] text-(--c-t-9a9a9a)">
            Research by {t.addedBy} · {new Date(t.researchedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
      </div>
    </div>
  );
}


/** Every version of this topic's research, newest first, so earlier numbers are never lost */
function TopicHistory({ id }: { id: Topic["id"] }) {
  const versions = useQuery(api.topics.history, { id });
  const [open, setOpen] = useState<string | null>(null);
  if (!versions || versions.length < 2) return null;
  return (
    <Section title={`History · ${versions.length} versions`}>
      <div className="overflow-hidden rounded-xl ring-1 ring-(--c-l-ebebeb)">
        {versions.map((v, i) => (
          <div key={v.id} className={i ? "border-t border-(--c-l-ebebeb)" : ""}>
            <button
              type="button"
              onClick={() => setOpen(open === v.id ? null : v.id)}
              aria-expanded={open === v.id}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-(--c-b-fafaf9)"
            >
              <span className="w-[120px] shrink-0 text-(--c-t-6b6b6b)">
                {new Date(v.takenAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                {i === 0 && <span className="ml-1 text-(--c-t-9a9a9a)">(now)</span>}
              </span>
              <span className="w-8 shrink-0 font-semibold tabular-nums text-(--c-t-1b1b1b)">{v.score}</span>
              <span className="min-w-0 flex-1 truncate text-(--c-t-8a8a8a)">
                {TREND[v.trend].label} · demand {v.demand} · competition {v.competition}
              </span>
              <IconChevron open={open === v.id} />
            </button>
            {open === v.id && (
              <div className="flex flex-col gap-2 px-3 pb-3 text-[13px] leading-[1.5] text-(--c-t-4a4a4a)">
                <p className="m-0">{v.whyNow}</p>
                {v.outliers.length > 0 && (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {v.outliers.map((o) => (
                      <li key={o.url} className="truncate">
                        <a href={o.url} target="_blank" rel="noreferrer" className="text-(--c-t-2358d8) no-underline hover:underline">
                          {o.title}
                        </a>
                        {o.views ? <span className="text-(--c-t-9a9a9a)"> · {fmt(o.views)} views</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
