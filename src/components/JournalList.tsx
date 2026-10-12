"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { IconPlus, IconSearch } from "./icons";

const day = (t: number) => {
  const d = new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
};

/**
 * The Journal: Riley's entries and internal docs. Each entry is the same document and editor as a script,
 * kept out of the script views, with no status or details.
 */
export function JournalList() {
  const entries = useQuery(api.videos.journal);
  const create = useMutation(api.videos.create);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const newEntry = async () => {
    setBusy(true);
    try {
      router.push(`/v/${await create({ format: "long", journal: true })}`);
    } catch {
      setBusy(false);
    }
  };

  const s = q.trim().toLowerCase();
  const shown = (entries ?? []).filter((e) => !s || `${e.title}\n${e.preview}`.toLowerCase().includes(s));

  return (
    <div className="mx-auto max-w-[760px] px-5 pb-24">
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-b border-(--c-l-ebebeb) pb-3">
        <div>
          <h1 className="m-0 text-[32px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">Journal</h1>
          <p className="m-0 mt-1 text-[14px] text-(--c-t-737373)">Your entries and notes{entries ? ` · ${entries.length}` : ""}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="mr-1 hidden h-8 w-[180px] items-center gap-2 rounded-lg px-2 text-(--c-t-9a9a9a) ring-1 ring-(--c-l-e3e3e0) focus-within:ring-(--c-l-c9c9c9) sm:flex">
            <IconSearch size={14} />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search entries"
              aria-label="Search journal entries"
              className="w-full min-w-0 border-none bg-transparent text-[13px] text-(--c-t-1b1b1b) outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void newEntry()}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-3 text-[13px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-50"
          >
            <IconPlus size={14} color="var(--c-on-ink)" />
            New entry
          </button>
        </div>
      </div>

      {entries === undefined ? null : shown.length === 0 ? (
        <div className="py-16 text-center text-[14px] text-(--c-t-737373)">
          {entries.length === 0 ? (
            <>
              Nothing here yet.{" "}
              <button type="button" onClick={() => void newEntry()} className="font-medium text-(--c-t-2358d8)">
                Write your first entry
              </button>
            </>
          ) : (
            "Nothing matches."
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-col">
          {shown.map((e) => (
            <Link key={e.id} href={`/v/${e.id}`} className="group -mx-3 block rounded-lg border-b border-(--c-l-f0f0f0) px-3 py-3.5 no-underline last:border-b-0 hover:bg-(--c-b-fafafa)">
              <div className="flex items-baseline gap-3">
                <span className={`min-w-0 flex-1 truncate text-[15.5px] font-medium ${e.title.trim() ? "text-(--c-t-1b1b1b)" : "text-(--c-t-9a9a9a)"}`}>{e.title.trim() || "Untitled"}</span>
                <span className="shrink-0 text-[12.5px] text-(--c-t-9a9a9a)">{day(e.createdAt)}</span>
              </div>
              {e.preview && <p className="m-0 mt-1 line-clamp-2 text-[14px] leading-[1.55] text-(--c-t-737373)">{e.preview}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
