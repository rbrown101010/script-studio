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

/** Keeps the line being commented on in view without moving the page more than needed (see below). */
export function snapToLine(key: string) {
  // Computers: never scroll. The sidebar opens beside the script and the line is highlighted where it is.
  // Phones: the comments sheet covers the bottom half, so scroll only if the line would end up hidden under it.
  if (!window.matchMedia("(max-width: 1023px)").matches) return;
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(key)}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const visibleBottom = window.innerHeight * 0.48;
    if (r.top >= 64 && r.bottom <= visibleBottom) return;
    window.scrollBy({ top: r.bottom > visibleBottom ? r.bottom - visibleBottom + 16 : r.top - 76, behavior: "smooth" });
  }, 50);
}
