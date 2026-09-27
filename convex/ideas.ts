// Mymind: saved ideas. Team only; nothing here touches scripts.
// People add, edit and delete ideas in the app; agents add them (one at a time or in bulk) through the agent API.

import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib";
import { socialPlatformOf } from "./socialLinks";

const MAX_NOTE = 20000;
export type IdeaKind = Doc<"ideas">["kind"];

const TWEET = /^https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/[^/\s]+\/status(?:es)?\/\d+/i;
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i;
const VIDEO = /\.(mp4|mov|webm|m4v)(\?|$)/i;

/** What a link is, so it gets the right card. */
export function kindOfUrl(url: string): IdeaKind {
  if (TWEET.test(url)) return "tweet";
  if (IMAGE.test(url)) return "image";
  if (VIDEO.test(url)) return "video";
  const p = socialPlatformOf(url);
  if (p === "youtube" || p === "tiktok" || /\/(reel|reels|videos?)\//i.test(url)) return "video";
  return "link";
}

const searchTextOf = (note: string, url: string | null, preview?: string) => `${note} ${url ?? ""} ${preview ?? ""}`.toLowerCase().slice(0, 30000);

export type NewIdea = { url?: string | null; note?: string; storageId?: Id<"_storage"> | null; mime?: string | null };

/** Adds one idea. A link that's already saved isn't saved twice (its note gets the new text appended). */
export async function insertIdea(ctx: MutationCtx, i: NewIdea, author: { name: string | null; agent: boolean }, createdAt?: number) {
  const url = i.url?.trim() || null;
  const note = (i.note ?? "").slice(0, MAX_NOTE);
  if (url && !/^https?:\/\//i.test(url)) throw new ConvexError(`Links must start with http:// or https:// (${url})`);
  if (!url && !note.trim() && !i.storageId) throw new ConvexError("An idea needs a link, a file or a note");
  if (url) {
    const existing = await ctx.db
      .query("ideas")
      .withIndex("by_url", (q) => q.eq("url", url))
      .first();
    if (existing) {
      if (note.trim() && !existing.note.includes(note.trim())) {
        const merged = existing.note.trim() ? `${existing.note.trim()}\n\n${note.trim()}` : note.trim();
        await ctx.db.patch(existing._id, { note: merged, searchText: searchTextOf(merged, url, existing.previewText) });
      }
      return { id: existing._id, duplicate: true };
    }
  }
  let fileUrl: string | null = null;
  if (i.storageId) fileUrl = await ctx.storage.getUrl(i.storageId);
  const mime = i.mime ?? null;
  const kind: IdeaKind = i.storageId ? (mime?.startsWith("video/") ? "video" : "image") : url ? kindOfUrl(url) : "note";
  const id = await ctx.db.insert("ideas", {
    kind,
    url,
    note,
    storageId: i.storageId ?? null,
    fileUrl,
    mime,
    authorName: author.name,
    agent: author.agent,
    searchText: searchTextOf(note, url),
    createdAt: createdAt && Number.isFinite(createdAt) ? createdAt : Date.now(),
  });
  // Look up what the link says in the background, so search finds it by topic
  if (url && kind !== "image") await ctx.scheduler.runAfter(0, internal.ideas.enrich, { id });
  return { id, duplicate: false };
}

const view = (i: Doc<"ideas">) => ({
  id: i._id,
  kind: i.kind,
  url: i.url,
  note: i.note,
  fileUrl: i.fileUrl,
  mime: i.mime,
  authorName: i.authorName,
  agent: i.agent,
  bookmarked: !!i.bookmarkedAt,
  createdAt: i.createdAt,
});

/** Newest first; with a search, the best matches. */
export const list = query({
  args: { search: v.optional(v.string()), bookmarked: v.optional(v.boolean()) },
  handler: async (ctx, { search, bookmarked }) => {
    await requireUser(ctx);
    const s = search?.trim().toLowerCase();
    const found = s
      ? await ctx.db
          .query("ideas")
          .withSearchIndex("search", (q) => q.search("searchText", s))
          .take(200)
      : await ctx.db.query("ideas").withIndex("by_created").order("desc").take(1000);
    const rows = bookmarked ? found.filter((i) => i.bookmarkedAt) : found;
    return rows.map(view);
  },
});

export const add = mutation({
  args: { url: v.optional(v.union(v.string(), v.null())), note: v.optional(v.string()), storageId: v.optional(v.union(v.id("_storage"), v.null())), mime: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    return insertIdea(ctx, a, { name: user?.name || user?.email || null, agent: false });
  },
});

export const updateNote = mutation({
  args: { id: v.id("ideas"), note: v.string() },
  handler: async (ctx, { id, note }) => {
    await requireUser(ctx);
    const idea = await ctx.db.get(id);
    if (!idea) throw new ConvexError("That idea was deleted");
    const n = note.slice(0, MAX_NOTE);
    await ctx.db.patch(id, { note: n, searchText: searchTextOf(n, idea.url, idea.previewText) });
  },
});

export const setBookmark = mutation({
  args: { id: v.id("ideas"), bookmarked: v.boolean() },
  handler: async (ctx, { id, bookmarked }) => {
    await requireUser(ctx);
    const idea = await ctx.db.get(id);
    if (!idea) throw new ConvexError("That idea was deleted");
    await ctx.db.patch(id, { bookmarkedAt: bookmarked ? Date.now() : null });
  },
});

export const remove = mutation({
  args: { id: v.id("ideas") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const idea = await ctx.db.get(id);
    if (!idea) return;
    if (idea.storageId) await ctx.storage.delete(idea.storageId).catch(() => {});
    await ctx.db.delete(id);
  },
});

// ---------- Preview text for search ----------

const TWEET_ID = /(?:twitter\.com|x\.com)\/[^/\s]+\/status(?:es)?\/(\d+)/i;

export const getForEnrich = internalQuery({
  args: { id: v.id("ideas") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const setPreviewText = internalMutation({
  args: { id: v.id("ideas"), previewText: v.string() },
  handler: async (ctx, { id, previewText }) => {
    const idea = await ctx.db.get(id);
    if (!idea) return;
    const text = previewText.slice(0, 5000);
    await ctx.db.patch(id, { previewText: text, searchText: searchTextOf(idea.note, idea.url, text) });
  },
});

/** Fetches what a saved link says (tweet text and author, video/page title) and stores it for search. */
export const enrich = internalAction({
  args: { id: v.id("ideas") },
  handler: async (ctx, { id }): Promise<void> => {
    const idea = await ctx.runQuery(internal.ideas.getForEnrich, { id });
    if (!idea?.url) return;
    let text = "";
    const tweetId = TWEET_ID.exec(idea.url)?.[1];
    if (tweetId) {
      await ctx.runAction(api.links.fetchTweet, { id: tweetId });
      const t = await ctx.runQuery(api.links.tweet, { id: tweetId });
      if (t.status === "ok") text = [t.card.authorName, `@${t.card.authorHandle}`, t.card.text, t.card.quote?.text ?? ""].join(" ");
    } else if (socialPlatformOf(idea.url)) {
      await ctx.runAction(api.links.fetchPreview, { url: idea.url });
      const p = await ctx.runQuery(api.links.preview, { url: idea.url });
      if (p.status === "ok") text = [p.card.author, p.card.title, p.card.description].join(" ");
    }
    // Mark as looked up even when nothing came back, so it isn't retried forever
    await ctx.runMutation(internal.ideas.setPreviewText, { id, previewText: text.trim() || " " });
  },
});

export const missingPreview = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"ideas">[]> =>
    (await ctx.db.query("ideas").collect()).filter((i) => i.url && i.previewText === undefined && i.kind !== "image").map((i) => i._id),
});

/** One-off: look up preview text for ideas saved before search covered it. Only adds search text. */
export const enrichAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ enriched: number }> => {
    const ids: Id<"ideas">[] = await ctx.runQuery(internal.ideas.missingPreview, {});
    for (const id of ids) await ctx.runAction(internal.ideas.enrich, { id });
    return { enriched: ids.length };
  },
});
