"use client";

import type { Block } from "@/lib/types";
import { uid } from "@/lib/util";
import { DocEditor } from "./DocEditor";
import { IconPlus } from "./icons";

/** "2/5" (done/total) for the tab label, or "" when there are no instructions yet. */
export function instructionsProgress(blocks: Block[]) {
  const todos = blocks.filter((b) => b.type === "todo" && b.content.trim());
  return todos.length ? `${todos.filter((b) => b.checked).length}/${todos.length}` : "";
}

/** Lighter-grey to-do list for the video editor, shown in the tabs above the script. */
export function Instructions({
  blocks,
  setBlocks,
  readOnly,
  canUpload,
  onFiles,
  activeId,
  onOpenComments,
  commentCounts,
}: {
  blocks: Block[];
  setBlocks: (fn: (prev: Block[]) => Block[]) => void;
  readOnly?: boolean;
  canUpload?: boolean;
  onFiles?: (blockId: string, files: File[]) => void;
  activeId?: string | null;
  onOpenComments?: (id: string, opts?: { newComment?: boolean }) => void;
  commentCounts?: Record<string, number>;
}) {
  return (
    <section aria-label="Editor instructions">
      <div className="pl-0.5">
        <DocEditor
          blocks={blocks}
          setBlocks={setBlocks}
          readOnly={readOnly}
          canUpload={canUpload}
          onFiles={onFiles}
          variant="instructions"
          canToggleTodos={!readOnly}
          activeId={activeId}
          onOpenComments={onOpenComments}
          canComment={!readOnly}
          commentCounts={commentCounts}
          placeholder="Add an instruction for the editor"
          footer={
            !readOnly && (
              <button
                type="button"
                onClick={() =>
                  setBlocks((prev) => {
                    const last = prev[prev.length - 1];
                    if (last && !last.content.trim() && last.type === "todo") return prev;
                    return [...prev, { id: uid(), type: "todo", content: "", comments: [] }];
                  })
                }
                className="mt-0.5 inline-flex h-[30px] items-center gap-2 text-[14px] text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
              >
                <IconPlus />
                <span>Add instruction</span>
              </button>
            )
          }
        />
      </div>
    </section>
  );
}
