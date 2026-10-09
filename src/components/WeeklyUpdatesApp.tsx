"use client";

import { useEffect, useMemo, useState } from "react";
import { TweetCard, tweetIdOf } from "./TweetCard";

/**
 * Weekly updates: what the agent tools shipped, week by week, on a calendar. Each week is its
 * own colour; clicking one lists its updates, and each update opens to its details and tweets.
 * The content is public/data/weekly-updates.json (one entry per week, keyed by its Monday).
 */

type Update = { date: string; tool: string; title: string; summary?: string; link?: { label: string; url: string }; tweets?: string[] };
type Week = { week: string; summary?: string; updates: Update[] };
type Data = { updatedAt: string; weeks: Week[] };

/** One colour per week, rotating, so neighbouring weeks never match */
const HUES: [number, number, number][] = [
  [99, 102, 241],
  [16, 185, 129],
  [245, 158, 11],
  [236, 72, 153],
  [14, 165, 233],
  [168, 85, 247],
  [239, 68, 68],
];

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (key: string) => new Date(`${key}T00:00:00Z`);
const mondayOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
const hueOf = (monday: string) => HUES[Math.round(utc(monday).getTime() / (7 * DAY)) % HUES.length];
const tint = ([r, g, b]: [number, number, number], a: number) => `rgb(${r} ${g} ${b} / ${a})`;
const short = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

function weekLabel(monday: string) {
  const start = utc(monday);
  const end = new Date(start.getTime() + 6 * DAY);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return `${short(start)} – ${sameMonth ? end.getUTCDate() : short(end)}`;
}

/** Today in the viewer's own calendar, as a UTC date (so weeks line up with the data) */
function today() {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

export function WeeklyUpdatesApp() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [month, setMonth] = useState(() => {
    const t = today();
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  });
  const [picked, setPicked] = useState(() => iso(mondayOf(today())));

  useEffect(() => {
    fetch("/data/weekly-updates.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => {
        setData(d);
        // Open on this week if it has news, otherwise the latest week that does
        const thisWeek = iso(mondayOf(today()));
        if (!d.weeks.some((w) => w.week === thisWeek && w.updates.length)) {
          const latest = [...d.weeks].filter((w) => w.updates.length).sort((a, b) => b.week.localeCompare(a.week))[0];
          if (latest) {
            setPicked(latest.week);
            const m = utc(latest.week);
            setMonth(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1)));
          }
        }
      })
      .catch(() => setFailed(true));
  }, []);

  const byWeek = useMemo(() => new Map((data?.weeks ?? []).map((w) => [w.week, w])), [data]);
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of data?.weeks ?? []) for (const u of w.updates) m.set(u.date, (m.get(u.date) ?? 0) + 1);
    return m;
  }, [data]);

  // The month's weeks, Monday to Sunday
  const rows = useMemo(() => {
    const first = mondayOf(month);
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    const out: Date[][] = [];
    for (let s = first; s < next; s = new Date(s.getTime() + 7 * DAY)) out.push(Array.from({ length: 7 }, (_, i) => new Date(s.getTime() + i * DAY)));
    return out;
  }, [month]);

  const now = iso(today());
  const week = byWeek.get(picked);
  const shift = (n: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + n, 1)));

  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em] text-(--c-t-1b1b1b)">Weekly updates</h1>

      {failed ? (
        <p className="mt-6 text-[14px] text-(--c-t-8a8a8a)">Couldn&apos;t load the updates.</p>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-14">
          <section>
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[15px] font-semibold text-(--c-t-1b1b1b)">
                {month.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}
              </h2>
              <div className="flex items-center">
                <NavButton label="Previous month" onClick={() => shift(-1)} d="M10 3.5 5.5 8l4.5 4.5" />
                <NavButton label="Next month" onClick={() => shift(1)} d="M6 3.5 10.5 8 6 12.5" />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-7 px-1 text-center text-[12px] text-(--c-t-8a8a8a)">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={i} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="mt-1 space-y-1">
              {rows.map((days) => {
                const key = iso(days[0]);
                const hue = hueOf(key);
                const count = byWeek.get(key)?.updates.length ?? 0;
                const selected = key === picked;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPicked(key)}
                    aria-pressed={selected}
                    aria-label={`Week of ${weekLabel(key)}${count ? `, ${count} updates` : ""}`}
                    className="grid w-full grid-cols-7 rounded-lg px-1 py-1.5 text-center transition-colors"
                    style={{
                      background: tint(hue, selected ? 0.32 : count ? 0.16 : 0.07),
                      boxShadow: selected ? `inset 0 0 0 1.5px ${tint(hue, 0.85)}` : undefined,
                    }}
                  >
                    {days.map((d) => {
                      const k = iso(d);
                      const inMonth = d.getUTCMonth() === month.getUTCMonth();
                      const n = byDay.get(k) ?? 0;
                      return (
                        <div key={k} className="flex flex-col items-center">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums ${
                              k === now ? "bg-(--c-t-1b1b1b) font-semibold text-(--c-b-ffffff)" : inMonth ? "text-(--c-t-1b1b1b)" : "text-(--c-t-9a9a9a)"
                            }`}
                          >
                            {d.getUTCDate()}
                          </span>
                          <span className="mt-0.5 flex h-1.5 gap-0.5">
                            {Array.from({ length: Math.min(n, 4) }, (_, i) => (
                              <span key={i} className="h-1 w-1 rounded-full" style={{ background: tint(hue, 1) }} />
                            ))}
                          </span>
                        </div>
                      );
                    })}
                  </button>
                );
              })}
            </div>
          </section>

          <WeekDetails key={picked} monday={picked} week={week} />
        </div>
      )}
    </div>
  );
}

function NavButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-(--c-t-737373) hover:bg-(--c-b-ececea) hover:text-(--c-t-1b1b1b)"
    >
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}

function WeekDetails({ monday, week }: { monday: string; week: Week | undefined }) {
  const hue = hueOf(monday);
  const updates = [...(week?.updates ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tint(hue, 1) }} />
        <h2 className="m-0 text-[20px] font-semibold tracking-[-0.01em] text-(--c-t-1b1b1b)">{weekLabel(monday)}</h2>
      </div>
      {week?.summary && <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.6] text-(--c-t-4a4a4a)">{week.summary}</p>}

      {updates.length === 0 ? (
        <p className="mt-4 text-[14px] text-(--c-t-9a9a9a)">No updates for this week.</p>
      ) : (
        <ol className="m-0 mt-5 list-none p-0">
          {updates.map((u, i) => {
            const isOpen = open === i;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-baseline gap-3 rounded-md px-2 py-2.5 text-left hover:bg-(--c-b-ececea)"
                >
                  <span className="w-[86px] shrink-0 text-[13px] text-(--c-t-8a8a8a)">{u.tool}</span>
                  <span className="min-w-0 flex-1 text-[15px] text-(--c-t-1b1b1b)">{u.title}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-(--c-t-9a9a9a)">{short(utc(u.date))}</span>
                </button>
                {isOpen && (
                  <div className="pb-5 pl-2 pr-2 pt-1 sm:pl-[106px]">
                    {u.summary && <p className="m-0 text-[15px] leading-[1.6] text-(--c-t-4a4a4a)">{u.summary}</p>}
                    {u.link && (
                      <a href={u.link.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[14px] text-(--c-t-737373) underline underline-offset-2 hover:text-(--c-t-1b1b1b)">
                        {u.link.label}
                      </a>
                    )}
                    {u.tweets?.map((url) => {
                      const id = tweetIdOf(url);
                      return id ? (
                        <div key={url} className="mt-3 max-w-[520px]">
                          <TweetCard id={id} url={url} />
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
