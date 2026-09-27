// Library: every file pasted into a comment (images, videos, audio, other files), across all scripts.
// Each one is indexed with its name, the line it was commented on ("linked line") and its script, so the
// Library page can list and search them without reading every comment and script. The index is rebuilt
// per script whenever that script's comments or lines change, and fully every few minutes as a safety net.

import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib";

type AssetFields = Omit<Doc<"assets">, "_id" | "_creationTime">;

/** Refresh this script's Library entries soon (after the current change is saved). */
export async function queueAssetSync(ctx: MutationCtx, videoId: Id<"videos">) {
  await ctx.scheduler.runAfter(0, internal.library.syncVideo, { videoId });
}

const nameFrom = (a: Doc<"comments">["attachments"][number]) => {
  if (a.name?.trim()) return a.name.trim().slice(0, 300);
  const tail = (a.url ?? "").split("?")[0].split("/").pop() ?? "";
  return tail && tail.length < 120 ? decodeURIComponent(tail) : `Untitled ${a.kind}`;
};

export const syncVideo = internalMutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }): Promise<null> => {
    const existing = await ctx.db
      .query("assets")
      .withIndex("by_video", (q) => q.eq("videoId", videoId))
      .collect();
    const video = await ctx.db.get(videoId);
    if (!video) {
      for (const e of existing) await ctx.db.delete(e._id);
      return null;
    }
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", videoId))
      .collect();
    const withFiles = comments.filter((c) => c.attachments.some((a) => a.kind !== "link" && a.url));

    // Current text of every line, from the script and the editor instructions
    const lines = new Map<string, string>();
    if (withFiles.length) {
      for (const kind of ["main", "instructions"] as const) {
        const doc = await ctx.db
          .query("documents")
          .withIndex("by_video", (q) => q.eq("videoId", videoId).eq("kind", kind))
          .first();
        if (!doc) continue;
        const blocks = await ctx.db
          .query("blocks")
          .withIndex("by_document", (q) => q.eq("documentId", doc._id))
          .collect();
        for (const b of blocks) lines.set(b.key, b.content);
      }
    }

    const want = new Map<string, AssetFields>();
    for (const c of withFiles) {
      const onLine = c.blockKey ? lines.get(c.blockKey) : undefined;
      const linkedLine = (onLine ?? (c.blockKey ? (c.quote ?? "") : "")).slice(0, 2000);
      for (const a of c.attachments) {
        if (a.kind === "link" || !a.url) continue;
        const name = nameFrom(a);
        const scriptTitle = video.title || "Untitled";
        const commentText = c.text.slice(0, 1000);
        want.set(`${c._id}:${a.id}`, {
          videoId,
          commentId: c._id,
          attachmentId: a.id,
          kind: a.kind,
          name,
          url: a.url,
          mime: a.mime,
          size: a.size,
          blockKey: c.blockKey,
          linkedLine,
          lineRemoved: !!c.blockKey && onLine === undefined,
          scriptTitle,
          commentText,
          searchText: [name, linkedLine, scriptTitle, commentText].join(" \n ").toLowerCase(),
          createdAt: c.createdAt,
        });
      }
    }

    for (const e of existing) {
      const key = `${e.commentId}:${e.attachmentId}`;
      const w = want.get(key);
      if (!w) {
        await ctx.db.delete(e._id);
        continue;
      }
      want.delete(key);
      const changed = (Object.keys(w) as (keyof AssetFields)[]).some((k) => e[k] !== w[k]);
      if (changed) await ctx.db.patch(e._id, w);
    }
    for (const w of want.values()) await ctx.db.insert("assets", w);
    return null;
  },
});

/** Rebuilds every script's entries (cron safety net, and the first fill). */
export const syncAll = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const videos = await ctx.db.query("videos").collect();
    for (const vid of videos) await queueAssetSync(ctx, vid._id);
    // Entries whose script was deleted
    const seen = new Set(videos.map((x) => x._id));
    const orphans = await ctx.db.query("assets").collect();
    for (const o of orphans) if (!seen.has(o.videoId)) await ctx.db.delete(o._id);
    return videos.length;
  },
});

export type LibraryAsset = {
  id: Id<"assets">;
  kind: Doc<"assets">["kind"];
  name: string;
  url: string | null;
  mime: string | null;
  size: number | null;
  videoId: Id<"videos">;
  scriptTitle: string;
  linkedLine: string;
  lineRemoved: boolean;
  wholeScript: boolean;
  commentText: string;
  createdAt: number;
};

/** One page of the Library, newest first, or the best matches for a search. */
export const list = query({
  args: { search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { search, paginationOpts }) => {
    await requireUser(ctx);
    const s = search?.trim().toLowerCase();
    const page = s
      ? await ctx.db
          .query("assets")
          .withSearchIndex("search", (q) => q.search("searchText", s))
          .paginate(paginationOpts)
      : await ctx.db.query("assets").withIndex("by_created").order("desc").paginate(paginationOpts);
    return {
      ...page,
      page: page.page.map(
        (a): LibraryAsset => ({
          id: a._id,
          kind: a.kind,
          name: a.name,
          url: a.url,
          mime: a.mime,
          size: a.size,
          videoId: a.videoId,
          scriptTitle: a.scriptTitle,
          linkedLine: a.linkedLine,
          lineRemoved: a.lineRemoved,
          wholeScript: a.blockKey === null,
          commentText: a.commentText,
          createdAt: a.createdAt,
        }),
      ),
    };
  },
});
