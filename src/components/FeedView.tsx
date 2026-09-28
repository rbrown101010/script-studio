"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FORMATS, STATUSES, statusOf, type VideoFormat, type VideoStatus } from "@/lib/types";
import { FormatIcon } from "./FormatIcon";
import { linkify } from "./Brief";
import { IconChevron, IconLink, IconSparkle } from "./icons";

type FeedItem = {
  id: Id<"updates">;
  videoId: string;
  videoTitle: string;
  videoStatus: string;
  videoFormat: "long" | "short";
  videoSponsored: string;
  urgent: boolean;
  title: string;
  details: string;
  link: string | null;
  source: string | null;
  happenedAt: number;
  authorName: string | null;
  agent: boolean;
};

type Filters = { status: "all" | VideoStatus; sponsor: "all" | "sponsored" | "notSponsored"; format: "all" | VideoFormat };
const ALL: Filters = { status: "all", sponsor: "all", format: "all" };
const sponsoredValue = (s: string) => s !== "none" && s !== "noSponsor";

/**
 * The Feed: every video's updates in one timeline, newest first, grouped by day. Urgent updates (need a
 * response now) are pinned on top until someone marks them handled. Its own filters sit at the top.
 */
export function FeedView() {
  const feed = useQuery(api.updates.feed, { limit: 300 }) as FeedItem[] | undefined;
  const setUrgent = useMutation(api.updates.setUrgent);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [f, setF] = useState<Filters>(ALL);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const items = (feed ?? []).filter(
    (u) =>
      (f.status === "all" || statusOf(u.videoStatus).value === f.status) &&
      (f.sponsor === "all" || (f.sponsor === "sponsored") === sponsoredValue(u.videoSponsored)) &&
      (f.format === "all" || u.videoFormat === f.format),
  );
  const urgent = items.filter((u) => u.urgent).sort((a, b) => b.happenedAt - a.happenedAt);
  const rest = items.filter((u) => !u.urgent);
  const days: { key: string; label: string; items: FeedItem[] }[] = [];
  for (const u of rest) {
    const d = new Date(u.happenedAt);
    const key = d.toDateString();
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(u);
    else days.push({ key, label: dayLabel(d), items: [u] });
  }
  const filtered = f.status !== "all" || f.sponsor !== "all" || f.format !== "all";

  const row = (u: FeedItem) => (
    <Row key={u.id} u={u} open={open.has(u.id)} onToggle={() => toggle(u.id)} onUrgent={(v) => void setUrgent({ id: u.id, urgent: v })} />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Status"
          value={f.status}
          onChange={(status) => setF({ ...f, status: status as Filters["status"] })}
          options={[{ value: "all", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
        />
        <FilterSelect
          label="Sponsorship"
          value={f.sponsor}
          onChange={(sponsor) => setF({ ...f, sponsor: sponsor as Filters["sponsor"] })}
          options={[
            { value: "all", label: "All sponsorships" },
            { value: "sponsored", label: "Sponsored" },
            { value: "notSponsored", label: "Not sponsored" },
          ]}
        />
        <FilterSelect
          label="Format"
          value={f.format}
          onChange={(format) => setF({ ...f, format: format as Filters["format"] })}
          options={[{ value: "all", label: "All formats" }, ...FORMATS.map((x) => ({ value: x.value, label: x.label }))]}
        />
        {filtered && (
          <button type="button" onClick={() => setF(ALL)} className="h-8 rounded-full px-3 text-[13px] text-(--c-t-737373) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)">
            Clear
          </button>
        )}
      </div>

      {feed === undefined ? (
        <div className="h-10" />
      ) : items.length === 0 ? (
        <p className="m-0 py-10 text-center text-[14px] text-(--c-t-737373)">
          {filtered ? "No updates for these filters." : "No updates yet. New emails, calls and approvals show up here as they're logged."}
        </p>
      ) : (
        <>
          {urgent.length > 0 && (
            <section aria-label="Urgent" className="rounded-2xl bg-(--c-b-fef6f5) p-2 ring-1 ring-(--c-l-f6d5d1)">
              <h2 className="m-0 flex items-center gap-2 px-2 pb-1 pt-1.5 text-[13px] font-semibold text-(--c-t-b42318)">
                <span className="h-2 w-2 rounded-full bg-(--c-b-d92d20)" aria-hidden="true" />
                Urgent · needs a response
                <span className="font-normal text-(--c-t-b42318) opacity-70">{urgent.length}</span>
              </h2>
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{urgent.map(row)}</ol>
            </section>
          )}
          {days.map((day) => (
            <section key={day.key} aria-label={day.label}>
              <h2 className="m-0 mb-2 px-1 text-[12px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">{day.label}</h2>
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{day.items.map(row)}</ol>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function Row({ u, open, onToggle, onUrgent }: { u: FeedItem; open: boolean; onToggle: () => void; onUrgent: (v: boolean) => void }) {
  const expandable = !!u.details.trim();
  return (
    <li className="group rounded-xl bg-(--c-b-ffffff) px-4 py-3 ring-1 ring-(--c-l-ebebeb) transition-shadow hover:shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px]">
            <FormatIcon format={u.videoFormat} size={12} />
            <Link href={`/v/${u.videoId}`} className="truncate font-medium text-(--c-t-6b6b6b) no-underline hover:text-(--c-t-1b1b1b) hover:underline">
              {u.videoTitle || "Untitled"}
            </Link>
          </div>
          <button
            type="button"
            disabled={!expandable}
            aria-expanded={expandable ? open : undefined}
            onClick={onToggle}
            className="mt-1 flex w-full items-start gap-1.5 text-left enabled:cursor-pointer"
          >
            <span className="min-w-0 flex-1 text-[15px] font-medium leading-[1.45] text-(--c-t-1b1b1b)">{u.title}</span>
            {expandable && (
              <span className="mt-1 shrink-0 text-(--c-t-9a9a9a)">
                <IconChevron open={open} />
              </span>
            )}
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-(--c-t-8a8a8a)">
            <time dateTime={new Date(u.happenedAt).toISOString()}>{u.urgent ? `${dayLabel(new Date(u.happenedAt))}, ${time(u.happenedAt)}` : time(u.happenedAt)}</time>
            {u.source && <span className="rounded-md bg-(--c-b-f4f4f4) px-1.5 py-px text-(--c-t-6b6b6b)">{u.source}</span>}
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
          {open && expandable && (
            <p className="m-0 mt-2.5 whitespace-pre-wrap break-words rounded-lg bg-(--c-b-fafafa) px-3 py-2.5 text-[14px] leading-[1.55] text-(--c-t-262626)">{linkify(u.details)}</p>
          )}
        </div>
        <UrgentButton urgent={u.urgent} onChange={onUrgent} />
      </div>
    </li>
  );
}

/** Marks an update urgent (shows on hover) or, once urgent, as handled. */
export function UrgentButton({ urgent, onChange }: { urgent: boolean; onChange: (v: boolean) => void }) {
  return urgent ? (
    <button
      type="button"
      onClick={() => onChange(false)}
      title="Mark as handled (unpins it)"
      className="shrink-0 rounded-full bg-(--c-b-d92d20) px-2.5 py-1 text-[12px] font-medium text-white hover:bg-(--c-b-b42318)"
    >
      Mark handled
    </button>
  ) : (
    <button
      type="button"
      onClick={() => onChange(true)}
      title="Needs a response right away: pin it to the top of the Feed"
      className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium text-(--c-t-9a9a9a) opacity-0 ring-1 ring-(--c-l-e5e5e5) hover:text-(--c-t-b42318) hover:ring-(--c-l-f6d5d1) focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
    >
      Mark urgent
    </button>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const on = value !== "all";
  return (
    <label
      className={`relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] ring-1 ${
        on ? "bg-(--c-b-1b1b1b) font-medium text-(--c-on-ink) ring-(--c-l-1b1b1b)" : "bg-(--c-b-ffffff) text-(--c-t-4a4a4a) ring-(--c-l-e5e5e5) hover:ring-(--c-l-c9c9c9)"
      }`}
    >
      {options.find((o) => o.value === value)?.label}
      <IconChevron open />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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
