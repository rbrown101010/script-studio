"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { IconPlus, IconTrash } from "./icons";

const ago = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Today, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) });
};

/** Excalidraw app: every board, newest first. Click one to draw; "New board" starts one. */
export function BoardsList() {
  const boards = useQuery(api.boards.list);
  const create = useMutation(api.boards.create);
  const remove = useMutation(api.boards.remove);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const newBoard = async () => {
    setBusy(true);
    try {
      const id = await create({});
      router.push(`/b/${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1080px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="m-0 flex-1 text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">Excalidraw</h1>
        <button
          type="button"
          disabled={busy}
          onClick={() => void newBoard()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-50"
        >
          <IconPlus color="var(--c-on-ink)" />
          New board
        </button>
      </div>
      {!boards ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-[150px] animate-pulse rounded-2xl bg-(--c-b-ececea)" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <p className="mt-16 text-center text-[14px] text-(--c-t-8a8a8a)">No boards yet. Start one with New board.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => {
            // The summary's text lines make a quick preview of what's on the board
            const preview = b.summary
              .split("\n")
              .filter((l) => l.startsWith("- "))
              .slice(0, 4)
              .map((l) => l.slice(2));
            return (
              <div key={b.id} className="group relative">
                <button
                  type="button"
                  onClick={() => router.push(`/b/${b.id}`)}
                  className="flex h-full min-h-[150px] w-full flex-col gap-2 rounded-2xl bg-(--c-b-ffffff) p-4 text-left ring-1 ring-(--c-l-e3e3e0) transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
                >
                  <span className="truncate pr-8 text-[15px] font-medium text-(--c-t-1b1b1b)">{b.title}</span>
                  <span className="flex flex-1 flex-col gap-0.5 text-[13px] leading-[1.45] text-(--c-t-737373)">
                    {preview.length ? preview.map((l, i) => <span key={i} className="truncate">{l}</span>) : <span className="text-(--c-t-9a9a9a)">{b.elementCount ? `${b.elementCount} shapes` : "Empty"}</span>}
                  </span>
                  <span className="text-[12px] text-(--c-t-9a9a9a)">{ago(b.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete "${b.title}"? This can't be undone.`)) void remove({ id: b.id as Id<"boards"> });
                  }}
                  aria-label={`Delete ${b.title}`}
                  className="absolute right-2.5 top-2.5 hidden h-7 w-7 items-center justify-center rounded-md text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-b42318) group-hover:flex pointer-coarse:flex"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
