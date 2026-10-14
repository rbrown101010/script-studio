// The Todo list: one shared list for the whole team, at the top of the sidebar (above Scripts) and of Home.
// It's a script-like record (videos.kind = "todo") so it gets the same editor: bullets, sub-bullets (Tab),
// files, and comments on any line.

import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { newSlug, requireUser } from "./lib";

async function findTodo(ctx: QueryCtx) {
  // Few rows have a kind, so a scan is fine; the oldest wins if there were ever two
  const rows = (await ctx.db.query("videos").collect()).filter((x) => x.kind === "todo");
  return rows.sort((a, b) => a._creationTime - b._creationTime)[0] ?? null;
}

export async function ensureTodo(ctx: MutationCtx, userId: Id<"users"> | null): Promise<Id<"videos">> {
  const found = await findTodo(ctx);
  if (found) return found._id;
  const now = Date.now();
  const videoId = await ctx.db.insert("videos", {
    title: "Todo",
    liveDate: null,
    status: "inProduction",
    format: "long",
    sponsored: "none",
    shareSlug: newSlug(),
    editPasscode: null,
    createdBy: userId,
    updatedAt: now,
    kind: "todo",
  });
  const main = await ctx.db.insert("documents", { videoId, kind: "main", editorName: null, guestToken: null, updatedAt: now });
  await ctx.db.insert("documents", { videoId, kind: "instructions", editorName: null, guestToken: null, updatedAt: now });
  // Start with one empty bullet so the list is ready to type into
  await ctx.db.insert("blocks", { documentId: main, videoId, key: crypto.randomUUID(), position: 0, type: "bullet", content: "", checked: false, color: null, sourceBlockId: null });
  return videoId;
}

/** The Todo list's id (made the first time anyone opens it) */
export const open = mutation({
  args: {},
  handler: async (ctx) => ensureTodo(ctx, await requireUser(ctx)),
});

export const ensureForAgent = internalMutation({
  args: {},
  handler: async (ctx) => ensureTodo(ctx, null),
});

/** For Home: the list's lines (live), and how many comments each has */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const todo = await findTodo(ctx);
    if (!todo) return null;
    const main = await ctx.db
      .query("documents")
      .withIndex("by_video", (q) => q.eq("videoId", todo._id).eq("kind", "main"))
      .first();
    const blocks = main
      ? await ctx.db
          .query("blocks")
          .withIndex("by_document", (q) => q.eq("documentId", main._id))
          .collect()
      : [];
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", todo._id))
      .collect();
    const counts: Record<string, number> = {};
    for (const c of comments) if (c.blockKey) counts[c.blockKey] = (counts[c.blockKey] ?? 0) + 1;
    return {
      id: todo._id,
      updatedAt: todo.updatedAt,
      lines: blocks.map((b) => ({
        key: b.key,
        type: b.type,
        content: b.content,
        checked: b.checked,
        indent: b.indent ?? 0,
        files: (b.images ?? []).length,
        comments: counts[b.key] ?? 0,
      })),
    };
  },
});

/** Quick add from Home: a new bullet at the end of the list */
export const add = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const userId = await requireUser(ctx);
    const t = text.trim().slice(0, 20000);
    if (!t) return;
    const videoId = await ensureTodo(ctx, userId);
    const main = await ctx.db
      .query("documents")
      .withIndex("by_video", (q) => q.eq("videoId", videoId).eq("kind", "main"))
      .first();
    if (!main) throw new Error("The Todo list has no text yet");
    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_document", (q) => q.eq("documentId", main._id))
      .collect();
    // A fresh list is one empty bullet: fill it in rather than adding below it
    const lone = blocks.length === 1 && !blocks[0].content.trim() ? blocks[0] : null;
    if (lone) await ctx.db.patch(lone._id, { content: t, type: "bullet" });
    else {
      const position = blocks.reduce((m, b) => Math.max(m, b.position), -1) + 1;
      await ctx.db.insert("blocks", { documentId: main._id, videoId, key: crypto.randomUUID(), position, type: "bullet", content: t, checked: false, color: null, sourceBlockId: null });
    }
    const now = Date.now();
    await ctx.db.patch(main._id, { updatedAt: now });
    await ctx.db.patch(videoId, { updatedAt: now });
  },
});
