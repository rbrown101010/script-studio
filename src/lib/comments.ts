import type { Attachment, Block, Comment } from "./types";

/** What the comments panel can do; the owner and share-link guests plug in different backends. */
export type CommentActions = {
  add: (blockKey: string | null) => Promise<string>;
  update: (id: string, text: string) => void;
  remove: (id: string) => void;
  addLink: (id: string, url: string) => void;
  removeAttachment: (id: string, attachmentId: string) => void;
  /** Present only when uploads are allowed */
  addFiles?: (id: string, files: File[]) => void;
  /** Add an existing file or link (e.g. from Mymind); team only */
  attach?: (id: string, attachment: Attachment) => void;
};

export const snippet = (s: string) => (s.length > 90 ? `${s.slice(0, 90)}…` : s);

/** Comment counts per line key, plus the whole-script comments (including ones whose line was removed). */
export function groupComments(comments: Comment[], blocks: Block[]) {
  const keys = new Set(blocks.map((b) => b.id));
  const counts: Record<string, number> = {};
  const script: Comment[] = [];
  for (const c of comments) {
    if (c.blockKey && keys.has(c.blockKey)) counts[c.blockKey] = (counts[c.blockKey] ?? 0) + 1;
    else script.push(c);
  }
  return { counts, script };
}

/**
 * Brings the line being commented on to the same spot every time: near the top on phones (above the
 * comments sheet), level with the quoted line in the comments panel on desktop. Waits for the layout to settle first.
 */
export function snapToLine(key: string) {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(key)}"]`);
    if (!el) return;
    const target = window.matchMedia("(max-width: 1023px)").matches ? 76 : 58;
    const delta = el.getBoundingClientRect().top - target;
    const calm = document.visibilityState !== "visible" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (Math.abs(delta) > 24) window.scrollBy({ top: delta, behavior: calm ? "auto" : "smooth" });
  }, 50);
}
