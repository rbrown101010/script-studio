import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { releaseFiles, requireUser } from "./lib";
import { attachment } from "./schema";
import { queueAssetSync } from "./library";

const MAX_TEXT = 10000;

export type CommentView = {
  id: Id<"comments">;
  blockKey: string | null;
  keyHistory: string[];
  quote: string | null;
  text: string;
  authorName: string | null;
  agent: boolean;
  mine: boolean;
  attachments: Doc<"comments">["attachments"];
  createdAt: number;
};

function view(c: Doc<"comments">, mine: boolean): CommentView {
  return {
    id: c._id,
    blockKey: c.blockKey,
    keyHistory: c.keyHistory ?? [],
    quote: c.quote,
    text: c.text,
    authorName: c.authorName,
    agent: c.agent,
    mine,
    attachments: c.attachments,
    createdAt: c.createdAt,
  };
}

async function byVideo(ctx: QueryCtx, videoId: Id<"videos">) {
  return ctx.db
    .query("comments")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();
}

async function videoBySlug(ctx: QueryCtx, slug: string) {
  return ctx.db
    .query("videos")
    .withIndex("by_slug", (q) => q.eq("shareSlug", slug))
    .unique();
}

async function lineText(ctx: QueryCtx, videoId: Id<"videos">, blockKey: string | null) {
  if (!blockKey) return null;
  const main = await ctx.db
    .query("documents")
    .withIndex("by_video", (q) => q.eq("videoId", videoId).eq("kind", "main"))
    .first();
  const ins = await ctx.db
    .query("documents")
    .withIndex("by_video", (q) => q.eq("videoId", videoId).eq("kind", "instructions"))
    .first();
  for (const d of [main, ins]) {
    if (!d) continue;
    const b = await ctx.db
      .query("blocks")
      .withIndex("by_document_key", (q) => q.eq("documentId", d._id).eq("key", blockKey))
      .unique();
    if (b) return b.content.slice(0, 300);
  }
  return null;
}

async function insert(
  ctx: MutationCtx,
  args: {
    videoId: Id<"videos">;
    blockKey: string | null;
    text: string;
    authorName: string | null;
    authorId: Id<"users"> | null;
    agent: boolean;
    guestToken: string | null;
    attachments?: Doc<"comments">["attachments"];
  },
) {
  const now = Date.now();
  const id = await ctx.db.insert("comments", {
    videoId: args.videoId,
    blockKey: args.blockKey,
    quote: await lineText(ctx, args.videoId, args.blockKey),
    text: args.text.slice(0, MAX_TEXT),
    authorName: args.authorName?.slice(0, 80) ?? null,
    authorId: args.authorId,
    agent: args.agent,
    guestToken: args.guestToken,
    attachments: args.attachments ?? [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(args.videoId, { updatedAt: now });
  if (args.attachments?.length) await queueAssetSync(ctx, args.videoId);
  return id;
}

// ---------- Team members ----------

export const list = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    const userId = await requireUser(ctx);
    const rows = await byVideo(ctx, videoId);
    return rows.map((c) => view(c, c.authorId === userId));
  },
});

export const add = mutation({
  args: { videoId: v.id("videos"), blockKey: v.union(v.string(), v.null()), text: v.string() },
  handler: async (ctx, { videoId, blockKey, text }) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    return insert(ctx, {
      videoId,
      blockKey,
      text,
      authorName: user?.name || user?.email?.split("@")[0] || null,
      authorId: userId,
      agent: false,
      guestToken: null,
    });
  },
});

export const update = mutation({
  args: { id: v.id("comments"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    await requireUser(ctx);
    await ctx.db.patch(id, { text: text.slice(0, MAX_TEXT), updatedAt: Date.now() });
  },
});

/** Puts a comment on a line (e.g. one whose line was removed). The line it was on is remembered. */
export const moveToLine = mutation({
  args: { id: v.id("comments"), blockKey: v.string() },
  handler: async (ctx, { id, blockKey }) => {
    await requireUser(ctx);
    const c = await ctx.db.get(id);
    if (!c) throw new ConvexError("Comment not found");
    const quote = await lineText(ctx, c.videoId, blockKey);
    if (quote === null) throw new ConvexError("That line isn't in the script");
    const history = c.keyHistory ?? [];
    await ctx.db.patch(id, {
      blockKey,
      quote,
      keyHistory: c.blockKey && c.blockKey !== blockKey ? [...history.filter((k) => k !== c.blockKey), c.blockKey].slice(-20) : history,
      updatedAt: Date.now(),
    });
    await queueAssetSync(ctx, c.videoId);
  },
});

/** Adds one file or link. Appending (rather than replacing the list) keeps parallel uploads safe. */
export const attach = mutation({
  args: { id: v.id("comments"), attachment },
  handler: async (ctx, { id, attachment: a }) => {
    await requireUser(ctx);
    const c = await ctx.db.get(id);
    if (!c) throw new ConvexError("Comment not found");
    if (a.url && !/^https?:\/\//i.test(a.url)) throw new ConvexError("Links must start with http:// or https://");
    await ctx.db.patch(id, { attachments: [...c.attachments, a], updatedAt: Date.now() });
    if (a.kind !== "link") await queueAssetSync(ctx, c.videoId);
  },
});

export const detach = mutation({
  args: { id: v.id("comments"), attachmentId: v.string() },
  handler: async (ctx, { id, attachmentId }) => {
    await requireUser(ctx);
    const c = await ctx.db.get(id);
    if (!c) return;
    const gone = c.attachments.filter((a) => a.id === attachmentId);
    await ctx.db.patch(id, { attachments: c.attachments.filter((a) => a.id !== attachmentId), updatedAt: Date.now() });
    await queueAssetSync(ctx, c.videoId);
    await releaseFiles(ctx, c.videoId, gone.flatMap((a) => (a.storageId ? [a.storageId] : [])));
  },
});

export const remove = mutation({
  args: { id: v.id("comments") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const c = await ctx.db.get(id);
    if (!c) return;
    await ctx.db.delete(id);
    await queueAssetSync(ctx, c.videoId);
    await releaseFiles(ctx, c.videoId, c.attachments.flatMap((a) => (a.storageId ? [a.storageId] : [])));
  },
});

// ---------- Share-link viewers ----------

export const listShared = query({
  args: { slug: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, { slug, token }) => {
    const video = await videoBySlug(ctx, slug);
    if (!video) return [];
    const rows = await byVideo(ctx, video._id);
    return rows.map((c) => view(c, !!token && c.guestToken === token));
  },
});

async function guestVideo(ctx: QueryCtx, slug: string, passcode: string) {
  const video = await videoBySlug(ctx, slug);
  if (!video || video.editPasscode === null || video.editPasscode !== passcode) {
    throw new ConvexError("That passcode isn't right.");
  }
  return video;
}

export const addAsGuest = mutation({
  args: {
    slug: v.string(),
    passcode: v.string(),
    token: v.string(),
    name: v.string(),
    blockKey: v.union(v.string(), v.null()),
    text: v.string(),
  },
  handler: async (ctx, { slug, passcode, token, name, blockKey, text }) => {
    if (token.length < 32) throw new ConvexError("Bad token");
    const video = await guestVideo(ctx, slug, passcode);
    return insert(ctx, {
      videoId: video._id,
      blockKey,
      text,
      authorName: name.trim() || "Guest",
      authorId: null,
      agent: false,
      guestToken: token,
    });
  },
});

async function ownGuestComment(ctx: MutationCtx, id: Id<"comments">, slug: string, passcode: string, token: string) {
  const video = await guestVideo(ctx, slug, passcode);
  const c = await ctx.db.get(id);
  if (!c || c.videoId !== video._id || c.guestToken !== token) throw new ConvexError("You can only change your own comments.");
  return c;
}

export const updateAsGuest = mutation({
  args: { id: v.id("comments"), slug: v.string(), passcode: v.string(), token: v.string(), text: v.string() },
  handler: async (ctx, { id, slug, passcode, token, text }) => {
    await ownGuestComment(ctx, id, slug, passcode, token);
    await ctx.db.patch(id, { text: text.slice(0, MAX_TEXT), updatedAt: Date.now() });
  },
});

export const attachLinkAsGuest = mutation({
  args: { id: v.id("comments"), slug: v.string(), passcode: v.string(), token: v.string(), url: v.string() },
  handler: async (ctx, { id, slug, passcode, token, url }) => {
    const c = await ownGuestComment(ctx, id, slug, passcode, token);
    if (!/^https?:\/\//.test(url)) throw new ConvexError("Links must start with http");
    const link = { id: crypto.randomUUID(), kind: "link" as const, url: url.slice(0, 2000), storageId: null, name: null, mime: null, size: null };
    await ctx.db.patch(id, { attachments: [...c.attachments, link], updatedAt: Date.now() });
  },
});

export const detachAsGuest = mutation({
  args: { id: v.id("comments"), slug: v.string(), passcode: v.string(), token: v.string(), attachmentId: v.string() },
  handler: async (ctx, { id, slug, passcode, token, attachmentId }) => {
    const c = await ownGuestComment(ctx, id, slug, passcode, token);
    await ctx.db.patch(id, { attachments: c.attachments.filter((a) => a.id !== attachmentId), updatedAt: Date.now() });
    await queueAssetSync(ctx, c.videoId);
  },
});

export const removeAsGuest = mutation({
  args: { id: v.id("comments"), slug: v.string(), passcode: v.string(), token: v.string() },
  handler: async (ctx, { id, slug, passcode, token }) => {
    const c = await ownGuestComment(ctx, id, slug, passcode, token);
    await ctx.db.delete(id);
    await queueAssetSync(ctx, c.videoId);
  },
});

// ---------- Agents ----------

/**
 * Posts a comment as an AI agent. Not callable from the browser: run it with
 * `npx convex run comments:addAgent '{...}'` or through the /agent/comment HTTP route.
 * Target the whole script (no line), a line by key, or a line by (part of) its text.
 */
export const addAgent = internalMutation({
  args: {
    script: v.string(),
    text: v.string(),
    agentName: v.optional(v.string()),
    blockKey: v.optional(v.string()),
    lineContains: v.optional(v.string()),
    /** Images, videos or links to attach, by URL */
    attachments: v.optional(v.array(v.object({ url: v.string(), name: v.optional(v.string()) }))),
  },
  handler: async (ctx, { script, text, agentName, blockKey, lineContains, attachments }) => {
    const videoId = ctx.db.normalizeId("videos", script);
    const video = videoId ? await ctx.db.get(videoId) : await videoBySlug(ctx, script.split("/").pop() ?? script);
    if (!video) throw new ConvexError("Script not found. Pass its id or share link.");
    let key: string | null = blockKey ?? null;
    if (!key && lineContains) {
      const needle = lineContains.toLowerCase();
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_video", (q) => q.eq("videoId", video._id))
        .collect();
      for (const d of docs.filter((x) => x.kind === "main" || x.kind === "instructions")) {
        const blocks = await ctx.db
          .query("blocks")
          .withIndex("by_document", (q) => q.eq("documentId", d._id))
          .collect();
        const hit = blocks.find((b) => b.content.toLowerCase().includes(needle));
        if (hit) {
          key = hit.key;
          break;
        }
      }
      if (!key) throw new ConvexError(`No line contains "${lineContains}".`);
    }
    if ((attachments ?? []).length > 20) throw new ConvexError("At most 20 attachments per comment");
    const files = (attachments ?? []).map((a) => {
      const url = a.url.trim();
      if (!/^https?:\/\//i.test(url)) throw new ConvexError(`Attachment links must start with http:// or https:// (${url})`);
      const kind = /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url) ? ("image" as const) : /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) ? ("video" as const) : ("link" as const);
      return { id: crypto.randomUUID(), kind, url, storageId: null, name: a.name?.slice(0, 200) ?? null, mime: null, size: null };
    });
    return insert(ctx, {
      videoId: video._id,
      blockKey: key,
      text,
      authorName: agentName?.trim() || "Claude",
      authorId: null,
      agent: true,
      guestToken: null,
      attachments: files,
    });
  },
});

// ---------- One-time move of comments that used to live inside blocks ----------

export const migrateBlockComments = internalMutation({
  args: {},
  handler: async (ctx) => {
    let moved = 0;
    const blocks = await ctx.db.query("blocks").collect();
    for (const b of blocks) {
      const legacy = [
        ...(b.attachments ?? []).map((a) => ({ text: "", author: null as string | null, createdAt: b._creationTime, attachments: [a] })),
        ...(b.comments ?? []),
      ];
      if (!legacy.length) continue;
      const doc = await ctx.db.get(b.documentId);
      if (doc && (doc.kind === "main" || doc.kind === "instructions")) {
        for (const c of legacy) {
          await ctx.db.insert("comments", {
            videoId: b.videoId,
            blockKey: b.key,
            quote: b.content.slice(0, 300),
            text: c.text,
            authorName: c.author,
            authorId: null,
            agent: false,
            guestToken: null,
            attachments: c.attachments,
            createdAt: c.createdAt,
            updatedAt: c.createdAt,
          });
          moved++;
        }
      }
      await ctx.db.patch(b._id, { attachments: undefined, comments: undefined });
    }
    return moved;
  },
});
