"use client";

import Link from "next/link";
import { useState } from "react";
import { statusOf, type VideoFormat } from "@/lib/types";
import { FormatIcon } from "./FormatIcon";
import { IconChevron } from "./icons";

export type CalendarVideo = { _id: string; title: string; liveDate: string | null; status: string; format: VideoFormat };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Month grid of scripts by live date. Drag a script onto another day (or from "No live date") to change its date. */
export function CalendarView({ videos, onMove }: { videos: CalendarVideo[]; onMove: (id: string, liveDate: string) => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dropDay, setDropDay] = useState<string | null>(null);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const today = ymd(new Date());
  const byDay = new Map<string, CalendarVideo[]>();
  for (const v of videos) if (v.liveDate) byDay.set(v.liveDate, [...(byDay.get(v.liveDate) ?? []), v]);
  const undated = videos.filter((v) => !v.liveDate);
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  const dropProps = (day: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("text/x-video")) return;
      e.preventDefault();
      if (dropDay !== day) setDropDay(day);
    },
    onDragLeave: () => setDropDay((d) => (d === day ? null : d)),
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData("text/x-video");
      setDropDay(null);
      if (id) {
        e.preventDefault();
        onMove(id, day);
      }
    },
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="m-0 mr-auto text-[20px] font-semibold text-(--c-t-1b1b1b)">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="h-8 rounded-lg border border-(--c-l-dcdcdc) px-3 text-[13px] font-medium text-(--c-t-1b1b1b) hover:bg-(--c-b-fafafa)">
          Today
        </button>
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
          <span className="inline-flex rotate-180">
            <IconChevron />
          </span>
        </button>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
          <IconChevron />
        </button>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-(--c-l-ebebeb)">
        {WEEKDAYS.map((w) => (
          <div key={w} className="border-b border-(--c-l-ebebeb) bg-(--c-b-fafafa) px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-(--c-t-9a9a9a)">
            <span className="sm:hidden">{w[0]}</span>
            <span className="hidden sm:inline">{w}</span>
          </div>
        ))}
        {days.map((d, i) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === month.getMonth();
          const list = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              {...dropProps(key)}
              className={`min-h-[56px] border-(--c-l-ebebeb) p-1 sm:min-h-[112px] sm:p-1.5 ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${
                inMonth ? "bg-(--c-b-ffffff)" : "bg-(--c-b-fcfcfc)"
              } ${dropDay === key ? "bg-(--c-b-f5f8ff)! outline-2 -outline-offset-2 outline-dashed outline-(--c-l-2358d8)" : ""}`}
            >
              <div
                className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] ${
                  key === today ? "bg-(--c-b-1b1b1b) font-semibold text-(--c-on-ink)" : inMonth ? "text-(--c-t-1b1b1b)" : "text-(--c-t-c4c4c4)"
                }`}
              >
                {d.getDate()}
              </div>
              {/* Phones: dots in the grid, titles in the list below. Wider screens: titles in the grid. */}
              <div className="flex flex-wrap gap-1 sm:hidden">
                {list.map((v) => (
                  <span key={v._id} className="h-[7px] w-[7px] rounded-full" style={{ background: statusOf(v.status).dot }} aria-hidden="true" />
                ))}
              </div>
              <div className="hidden flex-col gap-1 sm:flex">
                {list.map((v) => (
                  <Chip key={v._id} v={v} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Phones: this month's scripts as a list, since the grid is too narrow for titles */}
      <div className="mt-5 sm:hidden">
        {days
          .filter((d) => d.getMonth() === month.getMonth() && byDay.has(ymd(d)))
          .map((d) => (
            <div key={ymd(d)} className="flex gap-3 border-b border-(--c-l-f0f0f0) py-2.5">
              <div className={`w-11 shrink-0 text-[12px] ${ymd(d) === today ? "font-semibold text-(--c-t-1b1b1b)" : "text-(--c-t-737373)"}`}>
                {d.toLocaleDateString(undefined, { weekday: "short" })}
                <div className="text-[16px] font-medium text-(--c-t-1b1b1b)">{d.getDate()}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {byDay.get(ymd(d))!.map((v) => (
                  <Chip key={v._id} v={v} wide />
                ))}
              </div>
            </div>
          ))}
      </div>

      <div className="mt-6" {...dropProps("")}>
        <h3 className="m-0 mb-2 text-[13px] font-medium text-(--c-t-737373)">
          No live date <span className="font-normal text-(--c-t-9a9a9a)">{undated.length}</span>
        </h3>
        {undated.length === 0 ? (
          <p className="m-0 text-[13px] text-(--c-t-9a9a9a)">Every script here has a live date.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {undated.map((v) => (
              <Chip key={v._id} v={v} wide />
            ))}
          </div>
        )}
        <p className="m-0 mt-3 text-[12px] text-(--c-t-9a9a9a)">Drag a script onto a day to set its live date.</p>
      </div>
    </div>
  );
}

function Chip({ v, wide }: { v: CalendarVideo; wide?: boolean }) {
  const st = statusOf(v.status);
  return (
    <Link
      href={`/v/${v._id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-video", v._id);
        e.dataTransfer.effectAllowed = "move";
      }}
      title={v.title || "Untitled"}
      className={`flex min-w-0 items-start gap-1.5 rounded-md border border-(--c-l-ebebeb) bg-(--c-b-ffffff) px-1.5 py-1 text-[12px] leading-[1.3] text-(--c-t-1b1b1b) no-underline hover:border-(--c-l-d4d4d4) hover:bg-(--c-b-fafafa) ${
        wide ? "max-w-[280px]" : ""
      }`}
    >
      <span className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: st.dot }} aria-hidden="true" />
      <span className="mt-[2px] hidden shrink-0 sm:inline-flex">
        <FormatIcon format={v.format} size={11} />
      </span>
      <span className={wide ? "truncate" : "line-clamp-2 break-words"}>{v.title || "Untitled"}</span>
    </Link>
  );
}
