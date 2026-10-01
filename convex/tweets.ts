// Tweet: write tweets for the two X accounts connected in Composio, post now or schedule them.
// Scheduled tweets are posted by the Convex scheduler at their time. Drafts are saved for later;
// suggestions are written by agents (for @agentnative_ only) and only ever post once a person schedules them.
// A tweet can quote another tweet (quoteUrl) and carry a video or images (media), like real quote and video tweets.

import { ConvexError, v, type Infer } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireUser } from "./lib";
import { runTools, uploadMedia, waitForMedia } from "./composio";

/**
 * Our account ids → the connected account names in Composio and their X usernames. Set in the X_ACCOUNTS
 * environment variable as JSON, e.g. {"rileybrown":{"composio":"twitter_xxx","username":"rileybrown"}}.
 */
export const X_ACCOUNTS: Record<string, { composio: string; username: string }> = (() => {
  try {
    return JSON.parse(process.env.X_ACCOUNTS ?? "{}");
  } catch {
    return {};
  }
})();
const accountIds = v.array(v.string());
const media = v.array(v.object({ storageId: v.id("_storage"), kind: v.union(v.literal("video"), v.literal("image")), name: v.string(), mime: v.string() }));
type Media = Infer<typeof media>;
/** What a person writes in the composer */
const content = { accountIds, text: v.string(), quoteUrl: v.optional(v.union(v.string(), v.null())), media: v.optional(media) };
type Content = { accountIds: string[]; text: string; quoteUrl?: string | null; media?: Media };

/** The only account agents write suggestions for */
export const SUGGEST_ACCOUNT = "agentnative";

const TWEET_URL = /^https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/[^/\s]+\/status(?:es)?\/(\d+)/i;
export const quoteIdOf = (url: string | null | undefined) => (url ? (TWEET_URL.exec(url.trim())?.[1] ?? null) : null);

/** Cleans what was written; throws if it can't be posted. Drafts may be unfinished (no accounts check beyond known ones). */
function clean(c: Content, forPosting: boolean) {
  const ids = [...new Set(c.accountIds)];
  if (ids.some((a) => !X_ACCOUNTS[a] && a !== SUGGEST_ACCOUNT && a !== "rileybrown")) throw new ConvexError("Unknown account");
  if (forPosting && (!ids.length || ids.some((a) => !X_ACCOUNTS[a]))) throw new ConvexError("Pick an account to post from");
  const quoteUrl = c.quoteUrl?.trim() || null;
  if (quoteUrl && !quoteIdOf(quoteUrl)) throw new ConvexError("That isn't a link to a tweet (x.com/…/status/…)");
  const m = c.media ?? [];
  if (m.length > 4) throw new ConvexError("At most 4 images, or 1 video");
  if (m.some((x) => x.kind === "video") && m.length > 1) throw new ConvexError("A tweet can have one video, or up to 4 images");
  if (forPosting && !c.text.trim() && !quoteUrl && !m.length) throw new ConvexError("Write something first");
  if (c.text.length > 4000) throw new ConvexError("That's too long");
  return { accountIds: ids, text: c.text, quoteUrl, media: m };
}

async function withUrls(ctx: QueryCtx, t: Doc<"xPosts">) {
  return {
    id: t._id,
    accountIds: t.accountIds,
    text: t.text,
    at: t.at,
    status: t.status,
    results: t.results,
    quoteUrl: t.quoteUrl ?? null,
    media: await Promise.all((t.media ?? []).map(async (m) => ({ ...m, url: await ctx.storage.getUrl(m.storageId) }))),
    note: t.note ?? null,
    agentName: t.agentName ?? null,
    createdAt: t._creationTime,
  };
}

/** Everything the Tweet page shows: suggestions, drafts, the queue and what's been posted */
async function listAll(ctx: QueryCtx) {
  const by = (status: Doc<"xPosts">["status"], n: number) =>
    ctx.db
      .query("xPosts")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .take(n);
  const groups = await Promise.all([by("suggestion", 100), by("draft", 200), by("scheduled", 200), by("posting", 50), by("posted", 100), by("failed", 50)]);
  return Promise.all(groups.flat().map((t) => withUrls(ctx, t)));
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return listAll(ctx);
  },
});

/** Removes files that a tweet no longer uses */
async function dropMedia(ctx: MutationCtx, before: Media | undefined, after: Media) {
  const keep = new Set(after.map((m) => m.storageId));
  for (const m of before ?? []) if (!keep.has(m.storageId)) await ctx.storage.delete(m.storageId).catch(() => {});
}

/** An existing tweet that can still be changed (not posted or posting) */
async function editable(ctx: MutationCtx, id: Id<"xPosts">) {
  const t = await ctx.db.get(id);
  if (!t) throw new ConvexError("This tweet was deleted");
  if (t.status === "posting" || t.status === "posted" || t.status === "failed") throw new ConvexError("This tweet has already been posted");
  return t;
}

/** Saves to Drafts (new, or turns a suggestion / scheduled tweet back into a draft) */
export const saveDraft = mutation({
  args: { id: v.optional(v.id("xPosts")), ...content },
  handler: async (ctx, { id, ...c }) => {
    const userId = await requireUser(ctx);
    const clean_ = clean(c, false);
    if (!clean_.text.trim() && !clean_.quoteUrl && !clean_.media.length) throw new ConvexError("Write something first");
    if (id) {
      const t = await editable(ctx, id);
      if (t.job) await ctx.scheduler.cancel(t.job);
      await dropMedia(ctx, t.media, clean_.media);
      await ctx.db.patch(id, { ...clean_, status: "draft", at: Date.now(), job: null });
      return id;
    }
    return ctx.db.insert("xPosts", { ...clean_, status: "draft", at: Date.now(), results: [], createdBy: userId, job: null });
  },
});

/** Schedules a tweet: a new one, or a draft / suggestion / scheduled tweet being edited (id) */
export const schedule = mutation({
  args: { id: v.optional(v.id("xPosts")), ...content, at: v.number() },
  handler: async (ctx, { id, at, ...c }) => {
    const userId = await requireUser(ctx);
    const clean_ = clean(c, true);
    if (at < Date.now() + 30_000) throw new ConvexError("Pick a time in the future");
    if (id) {
      const t = await editable(ctx, id);
      if (t.job) await ctx.scheduler.cancel(t.job);
      await dropMedia(ctx, t.media, clean_.media);
      const job = await ctx.scheduler.runAt(at, internal.tweets.post, { id });
      await ctx.db.patch(id, { ...clean_, at, status: "scheduled", job });
      return id;
    }
    const newId = await ctx.db.insert("xPosts", { ...clean_, at, status: "scheduled", results: [], createdBy: userId, job: null });
    const job = await ctx.scheduler.runAt(at, internal.tweets.post, { id: newId });
    await ctx.db.patch(newId, { job });
    return newId;
  },
});

export const postNow = mutation({
  args: { id: v.optional(v.id("xPosts")), ...content },
  handler: async (ctx, { id, ...c }) => {
    const userId = await requireUser(ctx);
    const clean_ = clean(c, true);
    let postId = id;
    if (postId) {
      const t = await editable(ctx, postId);
      if (t.job) await ctx.scheduler.cancel(t.job);
      await dropMedia(ctx, t.media, clean_.media);
      await ctx.db.patch(postId, { ...clean_, at: Date.now(), status: "scheduled", job: null });
    } else {
      postId = await ctx.db.insert("xPosts", { ...clean_, at: Date.now(), status: "scheduled", results: [], createdBy: userId, job: null });
    }
    const job = await ctx.scheduler.runAfter(0, internal.tweets.post, { id: postId });
    await ctx.db.patch(postId, { job });
    return postId;
  },
});

/** Older clients: edit a scheduled tweet */
export const update = mutation({
  args: { id: v.id("xPosts"), accountIds, text: v.string(), at: v.number() },
  handler: async (ctx, { id, accountIds, text, at }) => {
    await requireUser(ctx);
    const t = await editable(ctx, id);
    const clean_ = clean({ accountIds, text, quoteUrl: t.quoteUrl, media: t.media }, true);
    if (at < Date.now() + 30_000) throw new ConvexError("Pick a time in the future");
    if (t.job) await ctx.scheduler.cancel(t.job);
    const job = await ctx.scheduler.runAt(at, internal.tweets.post, { id });
    await ctx.db.patch(id, { accountIds: clean_.accountIds, text, at, status: "scheduled", job });
  },
});

/** Deletes a draft, suggestion or scheduled tweet (so it never posts), or removes a posted/failed one from the list. Never deletes from X. */
export const remove = mutation({
  args: { id: v.id("xPosts") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const t = await ctx.db.get(id);
    if (!t) return;
    if (t.status === "posting") throw new ConvexError("It's posting right now");
    if (t.job && t.status === "scheduled") await ctx.scheduler.cancel(t.job);
    // Files of tweets that never posted aren't needed anymore; posted ones keep theirs (they're on X too)
    if (t.status === "draft" || t.status === "suggestion" || t.status === "scheduled") await dropMedia(ctx, t.media, []);
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
    const quoteId = quoteIdOf(t.quoteUrl);
    // Media ids belong to the account that uploaded them, so each account uploads its own copy
    const files = await Promise.all(
      (t.media ?? []).map(async (m) => ({ url: await ctx.storage.getUrl(m.storageId), name: m.name, mime: m.mime, kind: m.kind })),
    );
    const mediaIds: (string[] | Error)[] = await Promise.all(
      t.accountIds.map(async (a) => {
        if (!files.length) return [];
        try {
          if (files.some((f) => !f.url)) throw new Error("A file for this tweet is missing");
          const ids = await uploadMedia(X_ACCOUNTS[a].composio, files as { url: string; name: string; mime: string; kind: "video" | "image" }[]);
          await waitForMedia(X_ACCOUNTS[a].composio, ids);
          return ids;
        } catch (e) {
          return e instanceof Error ? e : new Error(String(e));
        }
      }),
    );
    const ready = t.accountIds.filter((_, i) => !(mediaIds[i] instanceof Error));
    try {
      const out = !ready.length
        ? []
        : await runTools(
        ready.map((a) => {
          const ids = mediaIds[t.accountIds.indexOf(a)] as string[];
          return {
            slug: "TWITTER_CREATION_OF_A_POST",
            account: X_ACCOUNTS[a].composio,
            args: { ...(t.text.trim() ? { text: t.text } : {}), ...(quoteId ? { quote_tweet_id: quoteId } : {}), ...(ids.length ? { media_media_ids: ids } : {}) },
          };
        }),
      );
      results = t.accountIds.map((a, i) => {
        const m = mediaIds[i];
        if (m instanceof Error) return { accountId: a, tweetId: null, url: null, error: `Couldn't attach the media: ${m.message}` };
        const r = out[ready.indexOf(a)];
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

// ---- Agent tools (MCP). Agents write suggestions and drafts; they never schedule or post. ----

const agentMedia = v.optional(v.array(v.object({ storageId: v.string(), name: v.optional(v.string()), mime: v.optional(v.string()) })));

/** Turns agent-uploaded files (storageIds from get_upload_url) into tweet media */
async function toMedia(ctx: MutationCtx, files: { storageId: string; name?: string; mime?: string }[] | undefined): Promise<Media | undefined> {
  if (!files) return undefined;
  const out: Media = [];
  for (const f of files) {
    const sid = ctx.db.system.normalizeId("_storage", f.storageId);
    const info = sid ? await ctx.db.system.get(sid) : null;
    if (!sid || !info) throw new ConvexError(`No uploaded file with storageId ${f.storageId}. Upload it with get_upload_url first.`);
    const mime = f.mime ?? info.contentType ?? "";
    const kind = mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "image" : null;
    if (!kind) throw new ConvexError(`${f.name ?? f.storageId} isn't a video or image`);
    out.push({ storageId: sid, kind, name: (f.name ?? `${kind}`).slice(0, 200), mime });
  }
  return out;
}

const forAgent = (t: Awaited<ReturnType<typeof withUrls>>) => ({
  id: t.id,
  tab: t.status === "suggestion" ? "suggestions" : t.status === "draft" ? "drafts" : t.status === "posted" || t.status === "failed" ? "posted" : "scheduled",
  status: t.status,
  accounts: t.accountIds.map((a) => (X_ACCOUNTS[a] ? `@${X_ACCOUNTS[a].username}` : a)),
  text: t.text,
  quoteUrl: t.quoteUrl,
  media: t.media.map((m) => ({ kind: m.kind, name: m.name, url: m.url })),
  note: t.note,
  at: new Date(t.at).toISOString(),
  links: t.results.filter((r) => r.url).map((r) => r.url),
  errors: t.results.filter((r) => r.error).map((r) => r.error),
});

export const agentList = internalQuery({
  args: { tab: v.optional(v.string()) },
  handler: async (ctx, { tab }) => {
    const all = (await listAll(ctx)).map(forAgent);
    return tab ? all.filter((t) => t.tab === tab) : all;
  },
});

/** Agent: add suggested tweets for @agentnative_ to the Suggestions tab */
export const agentSuggest = internalMutation({
  args: {
    tweets: v.array(v.object({ text: v.string(), quoteUrl: v.optional(v.string()), note: v.optional(v.string()), media: agentMedia })),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, { tweets, agentName }) => {
    if (tweets.length > 30) throw new ConvexError("At most 30 suggestions at once");
    const ids = [];
    for (const [i, t] of tweets.entries()) {
      const c = clean({ accountIds: [SUGGEST_ACCOUNT], text: t.text, quoteUrl: t.quoteUrl, media: await toMedia(ctx, t.media) }, false);
      if (!c.text.trim() && !c.quoteUrl && !c.media.length) throw new ConvexError("Each suggestion needs text");
      ids.push(
        await ctx.db.insert("xPosts", {
          ...c,
          status: "suggestion",
          // Keeps the order they were sent in (newest first on the page)
          at: Date.now() - i,
          results: [],
          createdBy: null,
          job: null,
          note: t.note?.trim().slice(0, 2000) || null,
          agentName: agentName?.slice(0, 80) || "Agent",
        }),
      );
    }
    return { added: ids.length, ids };
  },
});

/** Agent: save a draft for any account (Riley reviews it in Drafts) */
export const agentSaveDraft = internalMutation({
  args: { accounts: v.array(v.string()), text: v.string(), quoteUrl: v.optional(v.string()), media: agentMedia },
  handler: async (ctx, { accounts, text, quoteUrl, media: files }) => {
    const ids = accounts.map((h) => {
      const handle = h.replace(/^@/, "").toLowerCase();
      const id = Object.keys(X_ACCOUNTS).find((k) => k === handle || X_ACCOUNTS[k].username.toLowerCase() === handle);
      if (!id) throw new ConvexError(`Unknown account ${h}. Use ${Object.values(X_ACCOUNTS).map((a) => "@" + a.username).join(" or ")}.`);
      return id;
    });
    const c = clean({ accountIds: ids, text, quoteUrl, media: await toMedia(ctx, files) }, false);
    if (!c.text.trim() && !c.quoteUrl && !c.media.length) throw new ConvexError("Write something first");
    return ctx.db.insert("xPosts", { ...c, status: "draft", at: Date.now(), results: [], createdBy: null, job: null });
  },
});

/** Agent: edit a suggestion or draft (only those; scheduled and posted tweets are Riley's) */
export const agentEdit = internalMutation({
  args: { id: v.string(), text: v.optional(v.string()), quoteUrl: v.optional(v.union(v.string(), v.null())), note: v.optional(v.string()), media: agentMedia },
  handler: async (ctx, { id, text, quoteUrl, note, media: files }) => {
    const tid = ctx.db.normalizeId("xPosts", id);
    const t = tid ? await ctx.db.get(tid) : null;
    if (!t || !tid) throw new ConvexError("Tweet not found");
    if (t.status !== "suggestion" && t.status !== "draft") throw new ConvexError("Agents can only edit suggestions and drafts");
    const media_ = (await toMedia(ctx, files)) ?? t.media ?? [];
    const c = clean({ accountIds: t.accountIds, text: text ?? t.text, quoteUrl: quoteUrl === undefined ? t.quoteUrl : quoteUrl, media: media_ }, false);
    await dropMedia(ctx, t.media, c.media);
    await ctx.db.patch(tid, { ...c, ...(note !== undefined ? { note: note.trim() || null } : {}) });
  },
});

/** Agent: remove a suggestion or draft */
export const agentRemove = internalMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const tid = ctx.db.normalizeId("xPosts", id);
    const t = tid ? await ctx.db.get(tid) : null;
    if (!t || !tid) return;
    if (t.status !== "suggestion" && t.status !== "draft") throw new ConvexError("Agents can only remove suggestions and drafts");
    await dropMedia(ctx, t.media, []);
    await ctx.db.delete(tid);
  },
});

/** Test the media path without posting: uploads a stored file to X (never tweets). `npx convex run --prod tweets:testMediaUpload '{"storageId":"…","account":"agentnative"}'` */
export const testMediaUpload = internalAction({
  args: { storageId: v.id("_storage"), account: v.string(), mime: v.string(), kind: v.union(v.literal("video"), v.literal("image")) },
  handler: async (ctx, { storageId, account, mime, kind }) => {
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("No such file");
    const ids = await uploadMedia(X_ACCOUNTS[account].composio, [{ url, name: kind === "video" ? "test.mp4" : "test.jpg", mime, kind }]);
    await waitForMedia(X_ACCOUNTS[account].composio, ids);
    return ids;
  },
});

export type TweetId = Id<"xPosts">;
