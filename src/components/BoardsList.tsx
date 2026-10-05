"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useBoardData, useIsDark } from "@/lib/boardSource";
import { BoardDrawing } from "./BoardBlock";
import { IconBoard, IconPin, IconPlus, IconTrash } from "./icons";

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
  const setPinned = useMutation(api.boards.setPinned);
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
    <div className="mx-auto max-w-[760px]">
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
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-[288px] animate-pulse rounded-2xl bg-(--c-b-ececea)" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <p className="mt-16 text-center text-[14px] text-(--c-t-8a8a8a)">No boards yet. Start one with New board.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Pinned boards first (they're in the sidebar too) */}
          {[...boards.filter((b) => b.pinnedAt).sort((a, b) => a.pinnedAt! - b.pinnedAt!), ...boards.filter((b) => !b.pinnedAt)].map((b) => (
            <BoardRow
              key={b.id}
              board={b}
              onOpen={() => router.push(`/b/${b.id}`)}
              onPin={() => void setPinned({ id: b.id as Id<"boards">, pinned: !b.pinnedAt })}
              onDelete={() => {
                if (confirm(`Delete "${b.title}"? This can't be undone.`)) void remove({ id: b.id as Id<"boards"> });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type BoardItem = { id: string; title: string; updatedAt: number; elementCount: number; pinnedAt: number | null };

/**
 * One board in the list: its drawing in a frame, like Excalidraw's scene thumbnails, with the title
 * underneath. The scene only loads once the row scrolls near the screen, so long lists stay quick.
 */
function BoardRow({ board, onOpen, onPin, onDelete }: { board: BoardItem; onOpen: () => void; onPin: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return (
    <div ref={ref} className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-2xl bg-(--c-b-ffffff) text-left ring-1 ring-(--c-l-e3e3e0) transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
      >
        <div className="flex h-[232px] items-center justify-center overflow-hidden bg-(--c-b-fafaf9) px-4 py-3">
          {seen ? <RowPreview id={board.id} empty={!board.elementCount} /> : null}
        </div>
        <div className="flex items-center gap-2 border-t border-(--c-l-ebebeb) px-4 py-3 text-(--c-t-8a8a8a)">
          <IconBoard size={14} />
          <span className="min-w-0 flex-1 truncate pr-8 text-[15px] font-medium text-(--c-t-1b1b1b)">{board.title}</span>
          {board.pinnedAt && (
            <span className="flex shrink-0 items-center gap-1 text-[12px] text-(--c-t-2358d8)">
              <IconPin size={12} filled />
              Pinned
            </span>
          )}
          <span className="shrink-0 text-[12px] text-(--c-t-9a9a9a)">{ago(board.updatedAt)}</span>
        </div>
      </button>
      <button
        type="button"
        onClick={onPin}
        aria-label={board.pinnedAt ? `Unpin ${board.title}` : `Pin ${board.title} to the sidebar`}
        title={board.pinnedAt ? "Unpin from the sidebar" : "Pin to the sidebar"}
        className={`absolute right-11 top-2.5 hidden h-7 w-7 items-center justify-center rounded-md bg-(--c-b-ffffff) shadow-sm ring-1 ring-(--c-l-ebebeb) group-hover:flex pointer-coarse:flex ${
          board.pinnedAt ? "text-(--c-t-2358d8)" : "text-(--c-t-9a9a9a) hover:text-(--c-t-1b1b1b)"
        }`}
      >
        <IconPin size={14} filled={!!board.pinnedAt} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${board.title}`}
        className="absolute right-2.5 top-2.5 hidden h-7 w-7 items-center justify-center rounded-md bg-(--c-b-ffffff) text-(--c-t-9a9a9a) shadow-sm ring-1 ring-(--c-l-ebebeb) hover:text-(--c-t-b42318) group-hover:flex pointer-coarse:flex"
      >
        <IconTrash size={14} />
      </button>
    </div>
  );
}

function RowPreview({ id, empty }: { id: string; empty: boolean }) {
  const scene = useBoardData(id);
  const dark = useIsDark();
  if (empty) return <span className="text-[13px] text-(--c-t-9a9a9a)">Empty board</span>;
  if (!scene) return <div className="h-full w-full animate-pulse rounded-xl bg-(--c-b-f4f4f4)" />;
  return (
    <div className="w-full">
      <BoardDrawing scene={scene} maxHeight={206} dark={dark} />
    </div>
  );
}
