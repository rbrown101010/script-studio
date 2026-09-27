import { v } from "convex/values";
import { queueAssetSync } from "./library";
import { mutation, query } from "./_generated/server";
import { deleteDocument, newSlug, requireUser } from "./lib";
import { captionPlatform, sponsorship, videoStatus as status } from "./schema";

const format = v.union(v.literal("long"), v.literal("short"));

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const videos = await ctx.db.query("videos").withIndex("by_updated").order("desc").collect();
    return Promise.all(
      videos.map(async (video) => {
        const edited = await ctx.db
          .query("documents")
          .withIndex("by_video", (q) => q.eq("videoId", video._id).eq("kind", "edited"))
          .collect();
        return { ...video, editedCount: edited.length };
      }),
    );
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const videoId = ctx.db.normalizeId("videos", id);
    if (!videoId) return null;
    const video = await ctx.db.get(videoId);
    if (!video) return null;
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_video", (q) => q.eq("videoId", videoId))
      .collect();
    return {
      video,
      documents: documents.map((d) => ({
        _id: d._id,
        kind: d.kind,
        editorName: d.editorName,
        updatedAt: d.updatedAt,
      })),
    };
  },
});

export const create = mutation({
  args: { format, status: v.optional(status) },
  handler: async (ctx, { format, status }) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    const videoId = await ctx.db.insert("videos", {
      title: "",
      liveDate: null,
      status: status ?? "inProduction",
      format,
      sponsored: "none",
      shareSlug: newSlug(),
      editPasscode: null,
      createdBy: userId,
      updatedAt: now,
    });
    for (const kind of ["main", "instructions"] as const) {
      await ctx.db.insert("documents", { videoId, kind, editorName: null, guestToken: null, updatedAt: now });
    }
    return videoId;
  },
});

export const update = mutation({
  args: {
    id: v.id("videos"),
    title: v.optional(v.string()),
    liveDate: v.optional(v.union(v.string(), v.null())),
    status: v.optional(status),
    format: v.optional(format),
    sponsored: v.optional(sponsorship),
    captions: v.optional(v.array(captionPlatform)),
    brief: v.optional(v.string()),
    briefLinks: v.optional(v.array(v.object({ id: v.string(), label: v.string(), url: v.string() }))),
    editPasscode: v.optional(v.union(v.string(), v.null())),
    partnerId: v.optional(v.union(v.id("partners"), v.null())),
  },
  handler: async (ctx, { id, ...patch }) => {
    await requireUser(ctx);
    if (patch.editPasscode !== undefined && patch.editPasscode !== null && patch.editPasscode.trim().length < 8) {
      throw new Error("Passcode must be at least 8 characters");
    }
    if (patch.captions && (patch.captions.length > 30 || patch.captions.some((c) => c.fields.length > 30 || c.caption.length > 20000)))
      throw new Error("Too many captions or fields");
    if (patch.brief && patch.brief.length > 50000) throw new Error("The brief can be at most 50,000 characters");
    if (patch.briefLinks && (patch.briefLinks.length > 100 || patch.briefLinks.some((l) => !/^https?:\/\//i.test(l.url))))
      throw new Error("Links must start with http:// or https://");
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
    if (patch.title !== undefined) await queueAssetSync(ctx, id);
  },
});

export const resetShareLink = mutation({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    await ctx.db.patch(id, { shareSlug: newSlug() });
  },
});

export const remove = mutation({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_video", (q) => q.eq("videoId", id))
      .collect();
    for (const d of docs) await deleteDocument(ctx, d._id);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", id))
      .collect();
    for (const c of comments) {
      for (const a of c.attachments) if (a.storageId) await ctx.storage.delete(a.storageId).catch(() => {});
      await ctx.db.delete(c._id);
    }
    const updates = await ctx.db
      .query("updates")
      .withIndex("by_video", (q) => q.eq("videoId", id))
      .collect();
    for (const u of updates) await ctx.db.delete(u._id);
    await ctx.db.delete(id);
    await queueAssetSync(ctx, id);
  },
});
