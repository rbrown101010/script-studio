"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { linkify } from "./Brief";
import { IconChevron, IconLink, IconSparkle } from "./icons";

/** The Feed: every video's updates in one timeline, newest first, grouped by day. */
export function FeedView({ videoIds }: { videoIds: Set<string> }) {
  const feed = useQuery(api.updates.feed, { limit: 300 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (feed === undefined) return <div className="h-10" />;

  const items = feed.filter((u) => videoIds.has(u.videoId));
  if (!items.length)
    return <p className="m-0 py-10 text-center text-[14px] text-(--c-t-737373)">No updates yet for these scripts. New emails, calls and approvals show up here as they&apos;re logged.</p>;

  const days: { key: string; label: string; items: typeof items }[] = [];
  for (const u of items) {
    const d = new Date(u.happenedAt);
    const key = d.toDateString();
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(u);
    else days.push({ key, label: dayLabel(d), items: [u] });
  }

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.key} aria-label={day.label}>
          <h2 className="m-0 mb-1 text-[13px] font-medium text-(--c-t-737373)">{day.label}</h2>
          <ol className="m-0 list-none p-0">
            {day.items.map((u) => {
              const isOpen = open.has(u.id);
              const expandable = !!u.details.trim();
              return (
                <li key={u.id} className="border-b border-(--c-l-f0f0f0) py-3 last:border-0">
                  <Link href={`/v/${u.videoId}`} className="text-[12px] font-medium text-(--c-t-737373) no-underline hover:text-(--c-t-1b1b1b) hover:underline">
                    {u.videoTitle || "Untitled"}
                  </Link>
                  <button
                    type="button"
                    disabled={!expandable}
                    aria-expanded={expandable ? isOpen : undefined}
                    onClick={() => toggle(u.id)}
                    className="mt-0.5 flex w-full items-start gap-1.5 text-left enabled:cursor-pointer"
                  >
                    <span className="min-w-0 flex-1 text-[15px] font-medium leading-[1.45] text-(--c-t-1b1b1b)">{u.title}</span>
                    {expandable && (
                      <span className="mt-1 shrink-0 text-(--c-t-9a9a9a)">
                        <IconChevron open={isOpen} />
                      </span>
                    )}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-(--c-t-737373)">
                    <time dateTime={new Date(u.happenedAt).toISOString()}>{time(u.happenedAt)}</time>
                    {u.source && <span className="rounded bg-(--c-b-f4f4f4) px-1.5 py-px text-(--c-t-6b6b6b)">{u.source}</span>}
                    {u.link && (
                      <a href={u.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-(--c-t-2358d8) no-underline hover:underline">
                        <IconLink size={12} />
                        Open {u.source ? u.source.toLowerCase() : "link"}
                      </a>
                    )}
                    {u.authorName && (
                      <span className="inline-flex items-center gap-1">
                        {u.agent && <IconSparkle size={11} />}
                        {u.authorName}
                      </span>
                    )}
                  </div>
                  {isOpen && expandable && (
                    <p className="m-0 mt-2 whitespace-pre-wrap break-words rounded-lg bg-(--c-b-fafafa) px-3 py-2.5 text-[14px] leading-[1.55] text-(--c-t-262626)">
                      {linkify(u.details)}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function dayLabel(d: Date) {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 0) return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Updates logged with only a date are stored at noon UTC; don't show a time for those. */
function time(t: number) {
  const d = new Date(t);
  if (d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
