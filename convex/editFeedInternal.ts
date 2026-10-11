// Small internal helpers for transcribe.ts (which runs in Node, so it can't define queries itself)
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const versionFile = internalQuery({
  args: { versionId: v.id("editVersions") },
  handler: async (ctx, { versionId }) => {
    const r = await ctx.db.get(versionId);
    if (!r) return null;
    return { url: r.storageId ? await ctx.storage.getUrl(r.storageId) : (r.url ?? null), mime: r.mime ?? null };
  },
});

export const saveTranscript = internalMutation({
  args: {
    versionId: v.id("editVersions"),
    status: v.union(v.literal("done"), v.literal("failed"), v.literal("unavailable")),
    words: v.array(v.object({ w: v.string(), s: v.number(), e: v.number() })),
    provider: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { versionId, status, words, provider, error }) => {
    if (!(await ctx.db.get(versionId))) return;
    await ctx.db.patch(versionId, {
      transcript: { status, words, text: words.map((w) => w.w).join(" "), ...(provider ? { provider } : {}), ...(error ? { error } : {}) },
    });
  },
});
