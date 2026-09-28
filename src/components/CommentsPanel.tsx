"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CommentActions } from "@/lib/comments";
import type { Attachment, Comment } from "@/lib/types";
import { timeAgo } from "@/lib/util";
import { useIsMobile } from "@/lib/useIsMobile";
import { AttachmentList, LinkInput } from "./Attachments";
import { linkify } from "./Brief";
import { LinkCard, linkCardsIn } from "./LinkCard";
import { MindPicker, ideaToAttachment, type MindIdea } from "./MindPicker";
import { IconClip, IconLink, IconSparkle, IconTrash, IconX } from "./icons";

/**
 * Right-hand panel with the comments on one line, or on the whole script. It reads like a small
 * document: each comment is a paragraph with its files and links just beneath it.
 */
export function CommentsPanel({
  blockKey,
  title,
  quote,
  comments,
  actions,
  canWrite,
  canDeleteOthers,
  focusId,
  onClose,
  hideClose,
  onOpenImage,
  onPlace,
  onNextLine,
  onBackToLine,
  className = "",
}: {
  /** Line the new comments go on; null = the whole script */
  blockKey: string | null;
  title: string;
  /** The line being discussed; omitted for whole-script comments */
  quote?: string;
  comments: Comment[];
  /** Missing when the viewer can only read */
  actions?: CommentActions;
  canWrite?: boolean;
  /** Team members can remove anyone's comment (not just their own) */
  canDeleteOthers?: boolean;
  focusId?: string | null;
  onClose: () => void;
  /** No close button in the header (the sidebar has its own) */
  hideClose?: boolean;
  onOpenImage?: (url: string) => void;
  /** Start putting a comment (whose line was removed) onto a line the person clicks */
  onPlace?: (commentId: string) => void;
  /** ⌘Enter in a comment: continue writing on a new line under the commented one */
  onNextLine?: () => void;
  /** ⌘← in a comment: back to the end of the commented line */
  onBackToLine?: () => void;
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const canUpload = !!(canWrite && actions?.addFiles);
  const mobile = useIsMobile();
  const pickNew = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input,textarea,[contenteditable=true]")) onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const addWithFiles = async (files: File[]) => {
    if (!actions?.addFiles) return;
    const id = await actions.add(blockKey);
    actions.addFiles(id, files);
  };

  return (
    <aside
      aria-label="Comments"
      onDragOver={(e) => {
        if (!canUpload || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        setDragging(false);
        if (!canUpload || !e.dataTransfer.files.length) return;
        e.preventDefault();
        void addWithFiles(Array.from(e.dataTransfer.files));
      }}
      className={`flex flex-col pb-10 ${dragging ? "outline-2 -outline-offset-4 outline-dashed outline-(--c-l-2358d8)" : ""} ${className}`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-(--c-b-f4f4f2) px-5 pb-3 pt-4">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-(--c-t-737373)">{title}</div>

        </div>
        {!hideClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="-mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)"
        >
          <IconX />
        </button>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4">
        {comments.length === 0 && (
          <div className="py-6 text-[14px] text-(--c-t-9a9a9a)">{canWrite ? "No comments yet." : "No comments here."}</div>
        )}
        {comments.map((c) => (
          <CommentItem
            key={c.id}
            c={c}
            showQuote={quote === undefined && !!c.blockKey}
            canEdit={!!canWrite && c.mine && !c.agent}
            canDelete={!!canWrite && (c.mine || !!canDeleteOthers)}
            canUpload={canUpload && c.mine}
            actions={actions}
            autoFocus={focusId === c.id}
            onOpenImage={onOpenImage}
            onPlace={onPlace}
            onNextLine={onNextLine}
            onBackToLine={onBackToLine}
            alwaysShowActions={mobile}
          />
        ))}
      </div>

      {canWrite && actions && (
        <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
          <button
            type="button"
            onClick={() => void actions.add(blockKey)}
            className="inline-flex h-8 w-fit items-center gap-2 text-[14px] text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
          >
            <span className="text-[18px] leading-none">+</span>
            <span>Add comment</span>
          </button>
          {canUpload && mobile && (
            <>
              <button
                type="button"
                onClick={() => pickNew.current?.click()}
                className="inline-flex h-8 w-fit items-center gap-2 text-[14px] text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
              >
                <IconClip size={15} />
                <span>Attach files</span>
              </button>
              <input
                ref={pickNew}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) void addWithFiles(files);
                }}
              />
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function CommentItem({
  c,
  showQuote,
  canEdit,
  canDelete,
  canUpload,
  actions,
  autoFocus,
  onOpenImage,
  onPlace,
  onNextLine,
  onBackToLine,
  alwaysShowActions,
}: {
  c: Comment;
  showQuote: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUpload: boolean;
  actions?: CommentActions;
  autoFocus?: boolean;
  onOpenImage?: (url: string) => void;
  onNextLine?: () => void;
  onBackToLine?: () => void;
  /** Phones have no hover, so comment actions stay visible */
  onPlace?: (commentId: string) => void;
  alwaysShowActions?: boolean;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  /** "@" menu for Mymind: what's typed after @ and where the @ is (null = opened from the button) */
  const [mind, setMind] = useState<{ query: string; at: number | null } | null>(null);
  const mindKeys = useRef<((e: React.KeyboardEvent) => boolean) | null>(null);
  const canMind = canEdit && !!actions?.attach;
  // Local draft so typing never waits on the server; saved shortly after you stop
  const [draft, setDraft] = useState(c.text);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dirty.current) setDraft(c.text);
  }, [c.text]);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (autoFocus) ta.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const latest = useRef({ draft, actions, id: c.id });
  latest.current = { draft, actions, id: c.id };
  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    latest.current.actions?.update(latest.current.id, latest.current.draft);
  };
  // Save anything still pending when the panel closes
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) latest.current.actions?.update(latest.current.id, latest.current.draft);
    },
    [],
  );

  const attachments = c.attachments as Attachment[];

  return (
    <div
      className={`group/comment relative flex flex-col gap-2 rounded-xl bg-(--c-b-ffffff) px-4 pb-3.5 pt-3 shadow-[0_1px_3px_rgba(0,0,0,0.07)] ring-1 ring-(--c-hairline)`}
      onDragOver={(e) => {
        if (!canUpload || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        if (!canUpload || !e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        actions?.addFiles?.(c.id, Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-(--c-t-9a9a9a)">
          {c.agent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-(--c-b-efe9fb) px-2 py-0.5 text-[11px] font-medium text-(--c-t-5b3fb0)">
              <IconSparkle size={11} />
              Agent
            </span>
          )}
          <span className={`truncate ${c.agent ? "font-medium text-(--c-t-5b3fb0)" : ""}`}>{c.authorName || "Someone"}</span>
          <span>· {timeAgo(new Date(c.createdAt).toISOString())}</span>
        </span>
        {(canEdit || canDelete) && (
          <div
            className={`flex items-center gap-0.5 ${
              alwaysShowActions ? "" : "opacity-0 transition-opacity focus-within:opacity-100 group-hover/comment:opacity-100"
            }`}
          >
            {canUpload && (
              <button
                type="button"
                aria-label="Attach file to this comment"
                onClick={() => fileInput.current?.click()}
                className="flex h-7 w-7 items-center justify-center rounded-md text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
              >
                <IconClip size={15} />
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                aria-label="Add a link to this comment"
                onClick={() => setLinkOpen(true)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
              >
                <IconLink size={15} />
              </button>
            )}
            {canMind && (
              <button
                type="button"
                aria-label="Add from Mymind"
                title="Add from Mymind (or type @)"
                onClick={() => {
                  // Same as typing "@" at the end of the comment
                  const needsSpace = draft && !/\s$/.test(draft);
                  const text = `${draft}${needsSpace ? " " : ""}@`;
                  setDraft(text);
                  setMind({ query: "", at: text.length - 1 });
                  requestAnimationFrame(() => {
                    const el = ta.current;
                    if (el) {
                      el.focus();
                      el.setSelectionRange(text.length, text.length);
                    }
                  });
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-semibold text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
              >
                @
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                aria-label="Delete comment"
                onClick={() => {
                  if (!c.mine && !confirm("Delete this comment?")) return;
                  actions?.remove(c.id);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-b42318)"
              >
                <IconTrash size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Comments on the whole script (e.g. a batch of b-roll) can be put on a line later */}
      {!showQuote && !c.blockKey && onPlace && (
        <button
          type="button"
          onClick={() => onPlace(c.id)}
          className="w-fit rounded-md border border-(--c-l-dcdcdc) px-2 py-0.5 text-[12px] font-medium text-(--c-t-1b1b1b) hover:bg-(--c-b-f4f4f4)"
        >
          Add to a line
        </button>
      )}
      {showQuote && (
        <div className="flex items-start gap-2 border-l-2 border-(--c-l-ebebeb) pl-2.5">
          <span className="line-clamp-2 min-w-0 flex-1 text-[13px] text-(--c-t-9a9a9a)">On a removed line: {c.quote || "(empty)"}</span>
          {onPlace && (
            <button
              type="button"
              onClick={() => onPlace(c.id)}
              className="shrink-0 rounded-md border border-(--c-l-dcdcdc) px-2 py-0.5 text-[12px] font-medium text-(--c-t-1b1b1b) hover:bg-(--c-b-f4f4f4)"
            >
              Add to a line
            </button>
          )}
        </div>
      )}

      {canEdit ? (
        <div className="relative">
        <textarea
          ref={ta}
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (canMind) {
              const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length);
              const m = /(^|\s)@([^\s@]{0,40})$/.exec(before);
              if (m) setMind({ query: m[2], at: before.length - m[2].length - 1 });
              else if (mind?.at !== null) setMind(null);
            }
            dirty.current = true;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(save, 600);
          }}
          onBlur={save}
          // Pasting a copied image or video (e.g. a screenshot) attaches it to this comment
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => /^(image|video|audio)\//.test(f.type) || f.type === "application/pdf");
            if (!files.length || !actions?.addFiles) return;
            e.preventDefault();
            actions.addFiles(c.id, files);
          }}
          onKeyDown={(e) => {
            if (mind && mindKeys.current?.(e)) return;
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key === "Enter" && onNextLine) {
              e.preventDefault();
              save();
              onNextLine();
            } else if (mod && e.key === "ArrowLeft" && !e.shiftKey && onBackToLine) {
              e.preventDefault();
              save();
              onBackToLine();
            }
          }}
          placeholder={attachments.length ? "Add instructions for the editor…" : "Write a comment…"}
          aria-label="Comment"
          className="block w-full resize-none overflow-hidden bg-transparent text-[15px] leading-[1.6] text-(--c-t-262626) outline-none placeholder:text-(--c-t-9a9a9a)"
        />
          {mind && (
            <MindPicker
              query={mind.query}
              keyRef={mindKeys}
              onClose={() => setMind(null)}
              onPick={(idea: MindIdea) => {
                // Take the "@query" out of the text, then add the idea
                let text = draft;
                if (mind.at !== null) text = draft.slice(0, mind.at) + draft.slice(mind.at + 1 + mind.query.length);
                const att = ideaToAttachment(idea);
                if (att) actions?.attach?.(c.id, att);
                else text = `${text}${text && !text.endsWith("\n") ? "\n" : ""}“${idea.note.trim()}”`;
                setDraft(text);
                latest.current.draft = text;
                dirty.current = true;
                save();
                setMind(null);
                ta.current?.focus();
              }}
            />
          )}
        </div>
      ) : c.text ? (
        <p className="m-0 whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-(--c-t-262626)">{linkify(c.text)}</p>
      ) : null}

      {/* Social links written in the comment itself also show as cards (unless already attached) */}
      {linkCardsIn(draft)
        .filter((url) => !attachments.some((a) => a.url === url))
        .map((url) => (
          <div key={url} className="mt-1.5">
            <LinkCard url={url} compact />
          </div>
        ))}

      {attachments.length > 0 && (
        <div className="mt-1.5">
          <AttachmentList
            attachments={attachments}
            editable={canEdit}
            onRemove={(attId) => actions?.removeAttachment(c.id, attId)}
            onOpenImage={onOpenImage}
          />
        </div>
      )}

      {linkOpen && actions && <LinkInput onAdd={(url) => actions.addLink(c.id, url)} onClose={() => setLinkOpen(false)} />}

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) actions?.addFiles?.(c.id, files);
        }}
      />
    </div>
  );
}
