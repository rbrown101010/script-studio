"use client";

import { diffArrays, diffWordsWithSpace } from "diff";
import { useState, type ReactNode } from "react";
import { colorBg, type Block } from "@/lib/types";
import { listNumbers } from "@/lib/util";
import { useIsMobile } from "@/lib/useIsMobile";
import { BlockPrefix, rowOuterClass, textClass } from "./DocEditor";
import { IconComment } from "./icons";
import { BoardCard, BoardOverlay } from "./BoardBlock";


export type DiffSummary = { changed: number; added: number; removed: number };
type Item =
  | { kind: "same"; orig: Block; ed: Block; changed: boolean }
  | { kind: "added"; ed: Block }
  | { kind: "removed"; orig: Block };

/** Pairs an edited copy's blocks with the original's (via source_block_id). */
export function computeDiff(original: Block[], edited: Block[]) {
  const origById = new Map(original.map((b) => [b.id, b]));
  const seen = new Set<string>();
  const editedKeys = edited.map((b) => {
    const src = b.source_block_id;
    if (src && origById.has(src) && !seen.has(src)) {
      seen.add(src);
      return src;
    }
    return `new:${b.id}`;
  });
  const parts = diffArrays(
    original.map((b) => b.id),
    editedKeys,
  );
  const items: Item[] = [];
  let oi = 0;
  let ei = 0;
  const summary: DiffSummary = { changed: 0, added: 0, removed: 0 };
  for (const part of parts) {
    for (let k = 0; k < (part.count ?? part.value.length); k++) {
      if (part.removed) {
        items.push({ kind: "removed", orig: original[oi++] });
        summary.removed++;
      } else if (part.added) {
        items.push({ kind: "added", ed: edited[ei++] });
        summary.added++;
      } else {
        const orig = original[oi++];
        const ed = edited[ei++];
        const changed =
          orig.content !== ed.content ||
          orig.type !== ed.type ||
          !!orig.checked !== !!ed.checked ||
          (orig.color ?? null) !== (ed.color ?? null) ||
          JSON.stringify((orig.images ?? []).map((a) => a.url)) !== JSON.stringify((ed.images ?? []).map((a) => a.url));
        if (changed) summary.changed++;
        items.push({ kind: "same", orig, ed, changed });
      }
    }
  }
  return { items, summary };
}

/** Read-only edited version, with everything that differs from the original in red. */
export function DiffBlocks({
  original,
  edited,
  activeId,
  commentCounts,
  onOpenComments,
}: {
  original: Block[];
  edited: Block[];
  activeId?: string | null;
  commentCounts?: Record<string, number>;
  onOpenComments?: (blockId: string) => void;
}) {
  const { items } = computeDiff(original, edited);
  const numbers = listNumbers(edited);
  const mobile = useIsMobile();
  const [boardOpen, setBoardOpen] = useState<string | null>(null);

  return (
    <div>
      {boardOpen && <BoardOverlay id={boardOpen} readOnly onClose={() => setBoardOpen(null)} />}
      {items.map((it, idx) => {
        if (it.kind === "removed") {
          const b = it.orig;
          return (
            <div key={`r-${b.id}-${idx}`} data-row className={rowOuterClass(b.type, idx)}>
              <div className={`flex py-[3px] ${textClass(b.type)} text-red-400`}>
                <BlockPrefix type={b.type} checked={b.checked} className="text-red-300" />
                <div className="min-w-0 flex-1 whitespace-pre-wrap break-words line-through decoration-red-300">
                  {b.type === "board" ? <span className="text-[13px] italic">board removed</span> : b.content || <span className="text-[13px] italic">empty line removed</span>}
                </div>
              </div>
            </div>
          );
        }
        const b = it.ed;
        let text: ReactNode;
        let prefixCls = "";
        if (it.kind === "added") {
          text = <span className="text-red-600">{b.content}</span>;
          prefixCls = "text-red-600";
        } else {
          const o = it.orig;
          if (o.type !== b.type || !!o.checked !== !!b.checked) prefixCls = "text-red-600";
          text =
            o.content === b.content
              ? b.content
              : diffWordsWithSpace(o.content, b.content).map((p, i) =>
                  p.added ? (
                    <span key={i} className="text-red-600">
                      {p.value}
                    </span>
                  ) : p.removed ? (
                    <span key={i} className="text-red-300 line-through decoration-red-300">
                      {p.value}
                    </span>
                  ) : (
                    <span key={i}>{p.value}</span>
                  ),
                );
        }
        const marked = it.kind === "added" || (it.kind === "same" && it.changed);
        const colorChanged = it.kind === "same" && (it.orig.color ?? null) !== (b.color ?? null);
        const count = commentCounts?.[b.id] ?? 0;
        const open = activeId === b.id;
        return (
          <div key={`e-${b.id}-${idx}`} className={rowOuterClass(b.type, idx)}>
            <div
              data-row
              data-row-id={b.id}
              data-active-row={open ? "" : undefined}
              data-has-comments={count > 0 ? "" : undefined}
              className={`relative ${b.color || open ? "-mx-2 rounded-md px-2 py-[3px]" : "py-[3px]"} ${colorChanged ? "ring-1 ring-red-400" : ""} ${
                open ? "shadow-[0_0_0_1.5px_var(--comment-outline)]" : ""
              } ${mobile && count > 0 ? "pr-9" : ""}`}
              style={{ background: open ? (colorBg(b.color) ?? "var(--c-b-fdf3cf)") : colorBg(b.color) }}
            >
              {marked && <div className="absolute -left-5 bottom-1 top-1 w-[3px] rounded bg-red-500" />}
              <div className={`flex ${textClass(b.type)}`}>
                <BlockPrefix type={b.type} n={numbers.get(b.id)} checked={b.checked} className={prefixCls} />
                {b.type === "board" ? (
                  <div className="min-w-0 flex-1 py-1">
                    {b.content ? <BoardCard id={b.content} maxHeight={240} onOpen={() => setBoardOpen(b.content)} /> : null}
                  </div>
                ) : b.type === "images" ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3 py-1">
                    {(b.images ?? []).map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={a.id} src={a.url ?? ""} alt={a.name ?? ""} className="block h-[80px] w-auto max-w-[240px] object-contain" />
                    ))}
                  </div>
                ) : (
                <div className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${b.type === "todo" && b.checked ? "text-(--c-t-9a9a9a)" : ""}`}>
                  {text}
                  {it.kind === "added" && !b.content ? <span className="text-[13px] italic text-red-400">new empty line</span> : null}
                </div>
                )}
              </div>
              {count > 0 && (
                <button
                  type="button"
                  aria-label={`${count} comments`}
                  aria-pressed={open}
                  onClick={() => onOpenComments?.(b.id)}
                  className={`absolute ${mobile ? "right-0" : "-right-[64px]"} top-1 inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-[12px] hover:bg-(--c-b-f4f4f4) ${
                    open ? "bg-(--c-b-e7eefb) text-(--c-t-2358d8)" : count ? "bg-(--c-b-fdf3cf) text-(--c-t-7a5b00) hover:bg-(--c-b-f9e9b0)!" : "text-(--c-t-737373)"
                  }`}
                >
                  <IconComment size={13} />
                  <span>{count}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
