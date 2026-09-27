import { v } from "convex/values";
import { queueAssetSync } from "./library";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { blockFields } from "./schema";
import { reattachComments } from "./commentAnchors";
import { deleteDocument, docBlocks, filesOf, releaseFiles, requireUser } from "./lib";

export const blocks = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    await requireUser(ctx);
    return docBlocks(ctx, documentId);
  },
});

/** Applies the editor's changes: upserts by block key, deletes removed keys, frees unused files. */
export const sync = mutation({
  args: {
    documentId: v.id("documents"),
    upserts: v.array(v.object(blockFields)),
    deletes: v.array(v.string()),
  },
  handler: async (ctx, { documentId, upserts, deletes }) => {
    await requireUser(ctx);
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found");
    const dropped: Id<"_storage">[] = [];
    const byKey = async (key: string) =>
      ctx.db
        .query("blocks")
        .withIndex("by_document_key", (q) => q.eq("documentId", documentId).eq("key", key))
        .unique();

    for (const b of upserts) {
      const existing = await byKey(b.key);
      if (existing) {
        const kept = new Set(filesOf(b));
        for (const f of filesOf(existing)) if (!kept.has(f)) dropped.push(f);
        await ctx.db.patch(existing._id, { ...b, attachments: undefined });
      } else {
        await ctx.db.insert("blocks", { ...b, documentId, videoId: doc.videoId });
      }
    }
    for (const key of deletes) {
      const existing = await byKey(key);
      if (!existing) continue;
      dropped.push(...filesOf(existing));
      await ctx.db.delete(existing._id);
    }
    const now = Date.now();
    await ctx.db.patch(documentId, { updatedAt: now });
    await ctx.db.patch(doc.videoId, { updatedAt: now });
    await releaseFiles(ctx, doc.videoId, dropped);
    // Keep the Library's "linked line" text current for this script's files
    const hasAssets = await ctx.db
      .query("assets")
      .withIndex("by_video", (q) => q.eq("videoId", doc.videoId))
      .first();
    if (hasAssets) await queueAssetSync(ctx, doc.videoId);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const fileUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireUser(ctx);
    return ctx.storage.getUrl(storageId);
  },
});

/** Makes an edited (or archived) copy the main script; the current main is kept as archived. */
export const promote = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const doc = await ctx.db.get(documentId);
    if (!doc || (doc.kind !== "edited" && doc.kind !== "archived")) throw new Error("Version not found");
    const now = Date.now();
    const mains = await ctx.db
      .query("documents")
      .withIndex("by_video", (q) => q.eq("videoId", doc.videoId).eq("kind", "main"))
      .collect();
    // An archived version's editorName says who replaced it
    for (const m of mains) await ctx.db.patch(m._id, { kind: "archived", editorName: user?.name || user?.email || null, updatedAt: now });
    await ctx.db.patch(documentId, { kind: "main", guestToken: null, updatedAt: now });
    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();
    // Comments point at lines by key; move them onto the matching lines of the new version
    const newKeyFor = new Map<string, string>();
    for (const b of blocks) if (b.sourceBlockId && !newKeyFor.has(b.sourceBlockId)) newKeyFor.set(b.sourceBlockId, b.key);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", doc.videoId))
      .collect();
    for (const c of comments) {
      const next = c.blockKey ? newKeyFor.get(c.blockKey) : undefined;
      if (next && c.blockKey) await ctx.db.patch(c._id, { blockKey: next, keyHistory: [...(c.keyHistory ?? []), c.blockKey].slice(-20) });
    }
    // Comments whose line isn't in this version: bring back ones it used to have, re-attach rewritten ones
    const oldBlocks = [];
    for (const m of mains)
      oldBlocks.push(
        ...(await ctx.db
          .query("blocks")
          .withIndex("by_document", (q) => q.eq("documentId", m._id))
          .collect()),
      );
    const ins = await ctx.db
      .query("documents")
      .withIndex("by_video", (q) => q.eq("videoId", doc.videoId).eq("kind", "instructions"))
      .first();
    const insKeys = new Set(
      ins
        ? (
            await ctx.db
              .query("blocks")
              .withIndex("by_document", (q) => q.eq("documentId", ins._id))
              .collect()
          ).map((b) => b.key)
        : [],
    );
    await reattachComments(
      ctx,
      doc.videoId,
      oldBlocks.map((b) => ({ key: b.key, content: b.content })),
      blocks.map((b) => ({ key: b.key, content: b.content })),
      insKeys,
    );
    for (const b of blocks) if (b.sourceBlockId) await ctx.db.patch(b._id, { sourceBlockId: null });
    await ctx.db.patch(doc.videoId, { updatedAt: now });
  },
});

export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    await requireUser(ctx);
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.kind === "main" || doc.kind === "instructions") throw new Error("Can't delete this version");
    await deleteDocument(ctx, documentId);
  },
});
