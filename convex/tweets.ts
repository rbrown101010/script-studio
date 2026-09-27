// Tweet: write tweets for the two X accounts connected in Composio, post now or schedule them.
// Scheduled tweets are posted by the Convex scheduler at their time.

import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib";
import { runTools } from "./composio";

/** Our account ids → the account names in Composio, and their X usernames */
export const X_ACCOUNTS: Record<string, { composio: string; username: string }> = {
  rileybrown: { composio: "twitter_mooned-phenic", username: "rileybrown" },
  agentnative: { composio: "twitter_slatch-coff", username: "agentnative_" },
};
const accountIds = v.array(v.string());

function check(ids: string[], text: string) {
  if (!ids.length || ids.some((a) => !X_ACCOUNTS[a])) throw new ConvexError("Pick an account to post from");
  if (!text.trim()) throw new ConvexError("Write something first");
  if (text.length > 4000) throw new ConvexError("That's too long");
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("xPosts").withIndex("by_at").order("desc").take(200);
    return rows.map((t) => ({
      id: t._id,
      accountIds: t.accountIds,
      text: t.text,
      at: t.at,
      status: t.status,
      results: t.results,
      createdAt: t._creationTime,
    }));
  },
});

export const schedule = mutation({
  args: { accountIds, text: v.string(), at: v.number() },
  handler: async (ctx, { accountIds, text, at }) => {
    const userId = await requireUser(ctx);
    check(accountIds, text);
    if (at < Date.now() + 30_000) throw new ConvexError("Pick a time in the future");
    const id = await ctx.db.insert("xPosts", { accountIds, text, at, status: "scheduled", results: [], createdBy: userId, job: null });
    const job = await ctx.scheduler.runAt(at, internal.tweets.post, { id });
    await ctx.db.patch(id, { job });
    return id;
  },
});

export const postNow = mutation({
  args: { accountIds, text: v.string() },
  handler: async (ctx, { accountIds, text }) => {
    const userId = await requireUser(ctx);
    check(accountIds, text);
    const id = await ctx.db.insert("xPosts", { accountIds, text, at: Date.now(), status: "scheduled", results: [], createdBy: userId, job: null });
    const job = await ctx.scheduler.runAfter(0, internal.tweets.post, { id });
    await ctx.db.patch(id, { job });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("xPosts"), accountIds, text: v.string(), at: v.number() },
  handler: async (ctx, { id, accountIds, text, at }) => {
    await requireUser(ctx);
    const t = await ctx.db.get(id);
    if (!t || t.status !== "scheduled") throw new ConvexError("This tweet has already been posted");
    check(accountIds, text);
    if (at < Date.now() + 30_000) throw new ConvexError("Pick a time in the future");
    if (t.job) await ctx.scheduler.cancel(t.job);
    const job = await ctx.scheduler.runAt(at, internal.tweets.post, { id });
    await ctx.db.patch(id, { accountIds, text, at, job });
  },
});

/** Deletes a scheduled tweet (so it never posts), or removes a posted/failed one from the list. Never deletes from X. */
export const remove = mutation({
  args: { id: v.id("xPosts") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const t = await ctx.db.get(id);
    if (!t) return;
    if (t.status === "posting") throw new ConvexError("It's posting right now");
    if (t.job && t.status === "scheduled") await ctx.scheduler.cancel(t.job);
    await ctx.db.delete(id);
  },
});

export const getForPost = internalQuery({
  args: { id: v.id("xPosts") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** Claims the tweet for posting; false if it was deleted, edited away, or already handled. */
export const claim = internalMutation({
  args: { id: v.id("xPosts") },
  handler: async (ctx, { id }): Promise<boolean> => {
    const t = await ctx.db.get(id);
    if (!t || t.status !== "scheduled") return false;
    await ctx.db.patch(id, { status: "posting" });
    return true;
  },
});

export const finish = internalMutation({
  args: {
    id: v.id("xPosts"),
    results: v.array(v.object({ accountId: v.string(), tweetId: v.union(v.string(), v.null()), url: v.union(v.string(), v.null()), error: v.union(v.string(), v.null()) })),
  },
  handler: async (ctx, { id, results }) => {
    const t = await ctx.db.get(id);
    if (!t) return;
    await ctx.db.patch(id, { results, status: results.every((r) => r.tweetId) ? "posted" : "failed", job: null });
  },
});

export const post = internalAction({
  args: { id: v.id("xPosts") },
  handler: async (ctx, { id }): Promise<null> => {
    if (!(await ctx.runMutation(internal.tweets.claim, { id }))) return null;
    const t = await ctx.runQuery(internal.tweets.getForPost, { id });
    if (!t) return null;
    let results: { accountId: string; tweetId: string | null; url: string | null; error: string | null }[];
    try {
      const out = await runTools(
        t.accountIds.map((a) => ({ slug: "TWITTER_CREATION_OF_A_POST", account: X_ACCOUNTS[a].composio, args: { text: t.text } })),
      );
      results = t.accountIds.map((a, i) => {
        const r = out[i];
        const data = r.data as { data?: { id?: string } } | null;
        const tweetId = r.successful ? (data?.data?.id ?? null) : null;
        return {
          accountId: a,
          tweetId,
          url: tweetId ? `https://x.com/${X_ACCOUNTS[a].username}/status/${tweetId}` : null,
          error: tweetId ? null : (r.error ?? "X didn't return the new tweet"),
        };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results = t.accountIds.map((a) => ({ accountId: a, tweetId: null, url: null, error: msg }));
    }
    await ctx.runMutation(internal.tweets.finish, { id, results });
    return null;
  },
});

/** Read-only check that Composio can reach both accounts: `npx convex run tweets:checkAccounts` */
export const checkAccounts = internalAction({
  args: {},
  handler: async (): Promise<{ account: string; ok: boolean; username: string | null; error: string | null }[]> => {
    const ids = Object.keys(X_ACCOUNTS);
    const out = await runTools(ids.map((a) => ({ slug: "TWITTER_USER_LOOKUP_ME", account: X_ACCOUNTS[a].composio, args: {} })));
    return ids.map((a, i) => ({
      account: a,
      ok: out[i].successful,
      username: ((out[i].data as { data?: { username?: string } } | null)?.data?.username) ?? null,
      error: out[i].error,
    }));
  },
});

export type TweetId = Id<"xPosts">;
