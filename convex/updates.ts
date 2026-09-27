// Updates tab: a per-video log of what happened, newest first. Team only (never on share links).
// People add and remove entries in the app; agents add them through the agent API (they can't remove).

import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib";

const MAX_TITLE = 300;
const MAX_DETAILS = 20000;

export const list = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("updates")
      .withIndex("by_video", (q) => q.eq("videoId", videoId))
      .order("desc")
      .collect();
    return rows.map((u) => ({
      id: u._id,
      title: u.title,
      details: u.details,
      link: u.link,
      source: u.source,
      happenedAt: u.happenedAt,
      authorName: u.authorName,
      agent: u.agent,
    }));
  },
});

/** The Feed: the latest updates across every video, newest first. */
export const feed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("updates")
      .withIndex("by_happened")
      .order("desc")
      .take(Math.min(Math.max(limit ?? 200, 1), 500));
    const titles = new Map<string, string | null>();
    const out = [];
    for (const u of rows) {
      if (!titles.has(u.videoId)) titles.set(u.videoId, (await ctx.db.get(u.videoId))?.title ?? null);
      const videoTitle = titles.get(u.videoId);
      if (videoTitle === null) continue; // video was deleted
      out.push({
        id: u._id,
        videoId: u.videoId,
        videoTitle: videoTitle ?? "",
        title: u.title,
        details: u.details,
        link: u.link,
        source: u.source,
        happenedAt: u.happenedAt,
        authorName: u.authorName,
        agent: u.agent,
      });
    }
    return out;
  },
});

type NewUpdate = { title: string; details?: string; link?: string | null; source?: string | null; happenedAt?: number };

export async function insertUpdate(
  ctx: MutationCtx,
  videoId: Id<"videos">,
  u: NewUpdate,
  author: { name: string | null; id: Id<"users"> | null; agent: boolean },
) {
  const title = u.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new ConvexError("An update needs a title");
  const link = u.link?.trim() || null;
  if (link && !/^https?:\/\//i.test(link)) throw new ConvexError("The link must start with http:// or https://");
  const now = Date.now();
  return ctx.db.insert("updates", {
    videoId,
    title,
    details: (u.details ?? "").slice(0, MAX_DETAILS),
    link,
    source: u.source?.trim().slice(0, 40) || null,
    happenedAt: u.happenedAt && Number.isFinite(u.happenedAt) ? u.happenedAt : now,
    authorName: author.name,
    authorId: author.id,
    agent: author.agent,
    createdAt: now,
  });
}

export const add = mutation({
  args: {
    videoId: v.id("videos"),
    title: v.string(),
    details: v.optional(v.string()),
    link: v.optional(v.union(v.string(), v.null())),
    source: v.optional(v.union(v.string(), v.null())),
    happenedAt: v.optional(v.number()),
  },
  handler: async (ctx, { videoId, ...u }) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    return insertUpdate(ctx, videoId, u, { name: user?.name || user?.email || null, id: userId, agent: false });
  },
});

export const remove = mutation({
  args: { id: v.id("updates") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    await ctx.db.delete(id);
  },
});
