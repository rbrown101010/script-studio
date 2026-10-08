// Agent updates (a tab in Mymind): what GrokBot, Muse, Dot, ChatGPT desktop and Claude Code shipped, day by day,
// with the tweets that announced it. People see it in the app; agents keep it current through the agent API / MCP.

import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib";
import { SEED } from "./agentUpdatesSeed";

export const TOOLS = ["grokbot", "muse", "dot", "chatgpt", "claudeCode"] as const;
export type AgentTool = (typeof TOOLS)[number];
export const toolArg = v.union(...TOOLS.map((t) => v.literal(t)));

const MAX_TITLE = 200;
const MAX_SUMMARY = 4000;
const MAX_TWEETS = 20;

const view = (u: Doc<"agentUpdates">) => ({
  id: u._id,
  tool: u.tool,
  date: u.date,
  title: u.title,
  summary: u.summary,
  link: u.link,
  tweets: u.tweets,
  authorName: u.authorName,
  agent: u.agent,
  createdAt: u.createdAt,
});

async function newestFirst(ctx: { db: QueryCtx["db"] }, tool?: AgentTool) {
  const rows = tool
    ? await ctx.db
        .query("agentUpdates")
        .withIndex("by_tool_date", (q) => q.eq("tool", tool))
        .order("desc")
        .collect()
    : await ctx.db.query("agentUpdates").withIndex("by_date").order("desc").collect();
  // Same day: the one added last first
  return rows.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return (await newestFirst(ctx)).map(view);
  },
});

// ---------- Writing ----------

export type NewAgentUpdate = { tool: AgentTool; date: string; title: string; summary?: string; link?: string | null; tweets?: string[] };

function cleanDate(d: string) {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(d.trim());
  if (!m || !Number.isFinite(Date.parse(`${m[0]}T12:00:00Z`))) throw new ConvexError("date must be YYYY-MM-DD");
  return m[0];
}

function cleanUrl(u: string | null | undefined) {
  const s = u?.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) throw new ConvexError("Links must start with http:// or https://");
  return s;
}

/** x.com and twitter.com links to one tweet, as https://x.com/<user>/status/<id> */
export function cleanTweet(u: string) {
  const s = cleanUrl(u);
  const m = s && /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/status(?:es)?\/(\d+)/i.exec(s);
  if (!m) throw new ConvexError(`Not a tweet link: ${u}`);
  return `https://x.com/${m[1]}/status/${m[2]}`;
}
const tweetId = (u: string) => /\/status\/(\d+)/.exec(u)?.[1] ?? u;

/**
 * Adds an update, or merges into the one already there: the same tool, day and title, or one that already has any of
 * these tweets. Merging adds the new tweets and fills in a missing summary or link.
 */
export async function upsertAgentUpdate(ctx: MutationCtx, u: NewAgentUpdate, author: { name: string | null; agent: boolean }) {
  if (!TOOLS.includes(u.tool)) throw new ConvexError(`tool must be one of ${TOOLS.join(", ")}`);
  const title = u.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new ConvexError("An update needs a title");
  const date = cleanDate(u.date);
  const tweets = [...new Set((u.tweets ?? []).map(cleanTweet))].slice(0, MAX_TWEETS);
  const summary = (u.summary ?? "").trim().slice(0, MAX_SUMMARY);
  const link = cleanUrl(u.link);

  const sameTool = await ctx.db
    .query("agentUpdates")
    .withIndex("by_tool_date", (q) => q.eq("tool", u.tool))
    .collect();
  const ids = new Set(tweets.map(tweetId));
  const existing =
    sameTool.find((x) => x.date === date && x.title.toLowerCase() === title.toLowerCase()) ??
    (ids.size ? sameTool.find((x) => x.tweets.some((t) => ids.has(tweetId(t)))) : undefined);
  if (existing) {
    const have = new Set(existing.tweets.map(tweetId));
    const more = tweets.filter((t) => !have.has(tweetId(t)));
    const patch: Partial<Doc<"agentUpdates">> = {};
    if (more.length) patch.tweets = [...existing.tweets, ...more].slice(0, MAX_TWEETS);
    if (summary && !existing.summary) patch.summary = summary;
    if (link && !existing.link) patch.link = link;
    if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
    return { id: existing._id, added: false, tweetsAdded: more.length };
  }
  const id = await ctx.db.insert("agentUpdates", {
    tool: u.tool,
    date,
    title,
    summary,
    link,
    tweets,
    authorName: author.name,
    agent: author.agent,
    createdAt: Date.now(),
  });
  return { id, added: true, tweetsAdded: tweets.length };
}

export async function editAgentUpdate(
  ctx: MutationCtx,
  id: Id<"agentUpdates">,
  p: { tool?: AgentTool; date?: string; title?: string; summary?: string; link?: string | null; tweets?: string[]; addTweets?: string[]; removeTweets?: string[] },
) {
  const u = await ctx.db.get(id);
  if (!u) throw new ConvexError("No update with that id");
  const patch: Partial<Doc<"agentUpdates">> = {};
  if (p.tool !== undefined) {
    if (!TOOLS.includes(p.tool)) throw new ConvexError(`tool must be one of ${TOOLS.join(", ")}`);
    patch.tool = p.tool;
  }
  if (p.date !== undefined) patch.date = cleanDate(p.date);
  if (p.title !== undefined) {
    const t = p.title.trim().slice(0, MAX_TITLE);
    if (!t) throw new ConvexError("An update needs a title");
    patch.title = t;
  }
  if (p.summary !== undefined) patch.summary = p.summary.trim().slice(0, MAX_SUMMARY);
  if (p.link !== undefined) patch.link = cleanUrl(p.link);
  let tweets = p.tweets !== undefined ? p.tweets.map(cleanTweet) : u.tweets;
  if (p.addTweets?.length) tweets = [...tweets, ...p.addTweets.map(cleanTweet)];
  if (p.removeTweets?.length) {
    const gone = new Set(p.removeTweets.map((t) => tweetId(t.trim())));
    tweets = tweets.filter((t) => !gone.has(tweetId(t)));
  }
  if (p.tweets !== undefined || p.addTweets?.length || p.removeTweets?.length) {
    const seen = new Set<string>();
    patch.tweets = tweets.filter((t) => !seen.has(tweetId(t)) && !!seen.add(tweetId(t))).slice(0, MAX_TWEETS);
  }
  await ctx.db.patch(id, patch);
  return view({ ...u, ...patch });
}

const newArgs = {
  tool: toolArg,
  date: v.string(),
  title: v.string(),
  summary: v.optional(v.string()),
  link: v.optional(v.union(v.string(), v.null())),
  tweets: v.optional(v.array(v.string())),
};

export const add = mutation({
  args: newArgs,
  handler: async (ctx, u) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    return (await upsertAgentUpdate(ctx, u, { name: user?.name || user?.email || null, agent: false })).id;
  },
});

export const update = mutation({
  args: {
    id: v.id("agentUpdates"),
    tool: v.optional(toolArg),
    date: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    link: v.optional(v.union(v.string(), v.null())),
    tweets: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, ...p }) => {
    await requireUser(ctx);
    await editAgentUpdate(ctx, id, p);
  },
});

export const remove = mutation({
  args: { id: v.id("agentUpdates") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    await ctx.db.delete(id);
  },
});

// ---------- Agents (through agent.ts routes and the MCP server) ----------

const toolNames: Record<string, AgentTool> = {
  grokbot: "grokbot",
  grok: "grokbot",
  muse: "muse",
  dot: "dot",
  dots: "dot",
  chatgpt: "chatgpt",
  chatgptdesktop: "chatgpt",
  claudecode: "claudeCode",
};
/** Agents may write "ChatGPT desktop", "Claude Code", "Dots"… */
function toolOf(t: string): AgentTool {
  const k = t.toLowerCase().replace(/[^a-z]/g, "");
  const tool = toolNames[k];
  if (!tool) throw new ConvexError(`Unknown tool "${t}". Use one of ${TOOLS.join(", ")}`);
  return tool;
}

export const addForAgent = internalMutation({
  args: {
    updates: v.array(
      v.object({
        tool: v.string(),
        date: v.string(),
        title: v.string(),
        summary: v.optional(v.string()),
        link: v.optional(v.union(v.string(), v.null())),
        tweets: v.optional(v.array(v.string())),
      }),
    ),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, { updates, agentName }) => {
    if (updates.length > 200) throw new ConvexError("At most 200 updates per call; send the rest in another call");
    const name = (agentName?.trim() || "Claude").slice(0, 60);
    const out = [];
    for (const u of updates) {
      const r = await upsertAgentUpdate(ctx, { ...u, tool: toolOf(u.tool) }, { name, agent: true });
      out.push({ id: r.id, title: u.title, added: r.added, tweetsAdded: r.tweetsAdded });
    }
    return { added: out.filter((r) => r.added).length, merged: out.filter((r) => !r.added).length, updates: out };
  },
});

export const editForAgent = internalMutation({
  args: {
    id: v.string(),
    tool: v.optional(v.string()),
    date: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    link: v.optional(v.union(v.string(), v.null())),
    addTweets: v.optional(v.array(v.string())),
    removeTweets: v.optional(v.array(v.string())),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, { id, tool, agentName: _a, ...p }) => {
    const docId = ctx.db.normalizeId("agentUpdates", id);
    if (!docId) throw new ConvexError("No update with that id (get ids from list_agent_updates)");
    return editAgentUpdate(ctx, docId, { ...p, ...(tool ? { tool: toolOf(tool) } : {}) });
  },
});

export const removeForAgent = internalMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const docId = ctx.db.normalizeId("agentUpdates", id);
    if (!docId || !(await ctx.db.get(docId))) throw new ConvexError("No update with that id");
    await ctx.db.delete(docId);
    return { deleted: true };
  },
});

export const listForAgent = internalQuery({
  args: { tool: v.optional(v.string()), since: v.optional(v.string()), query: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { tool, since, query, limit }) => {
    let rows = await newestFirst(ctx, tool ? toolOf(tool) : undefined);
    if (since) rows = rows.filter((u) => u.date >= cleanDate(since));
    const q = query?.trim().toLowerCase();
    if (q) rows = rows.filter((u) => `${u.title} ${u.summary} ${u.tweets.join(" ")}`.toLowerCase().includes(q));
    return rows.slice(0, Math.min(Math.max(limit ?? 100, 1), 1000)).map(({ _id, _creationTime: _c, createdAt: _t, agent: _ag, ...u }) => ({ id: _id, ...u }));
  },
});

/** Fills the tab with the starting list (safe to run again; merges): `npx convex run agentUpdates:seed` */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    let added = 0;
    for (const u of SEED) if ((await upsertAgentUpdate(ctx, u, { name: "Seed", agent: true })).added) added++;
    return { added, total: SEED.length };
  },
});
