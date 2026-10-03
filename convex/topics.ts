import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib";
import { research, topicStatus } from "./topicFields";

const researchArg = v.object(research);
type Research = Infer<typeof researchArg>;

const http = (u: string) => /^https?:\/\//i.test(u);
const clip = (s: string | undefined, n: number) => (s === undefined ? undefined : s.trim().slice(0, n));

/** Tidies research before it's stored: sane lengths, a 0–100 score, only http(s) links */
function clean(r: Research): Research {
  if (!r.title.trim()) throw new ConvexError("Each topic needs a title");
  return {
    ...r,
    title: r.title.trim().slice(0, 160),
    angle: r.angle.trim().slice(0, 1000),
    category: r.category.trim().slice(0, 40) || "Other",
    score: Math.max(0, Math.min(100, Math.round(r.score))),
    demandNote: clip(r.demandNote, 600),
    competitionNote: clip(r.competitionNote, 600),
    whyNow: r.whyNow.trim().slice(0, 3000),
    keywords: r.keywords.slice(0, 30).map((k) => ({ ...k, term: k.term.trim().slice(0, 120), note: clip(k.note, 300) })),
    outliers: r.outliers
      .filter((o) => http(o.url))
      .slice(0, 20)
      .map((o) => ({ ...o, title: o.title.trim().slice(0, 300), channel: clip(o.channel, 120), note: clip(o.note, 500), published: clip(o.published, 40) })),
    titleIdeas: r.titleIdeas.slice(0, 15).map((t) => t.trim().slice(0, 200)).filter(Boolean),
    hooks: r.hooks.slice(0, 10).map((t) => t.trim().slice(0, 500)).filter(Boolean),
    sources: r.sources.filter((s) => http(s.url)).slice(0, 30).map((s) => ({ label: s.label.trim().slice(0, 200) || s.url, url: s.url })),
  };
}

const view = (t: Doc<"topics">) => ({
  id: t._id,
  ...Object.fromEntries(Object.keys(research).map((k) => [k, t[k as keyof Research]])),
  status: t.status,
  notes: t.notes ?? "",
  videoId: t.videoId ?? null,
  addedBy: t.addedBy ?? null,
  researchedAt: t.researchedAt,
  updatedAt: t.updatedAt,
}) as Research & { id: Id<"topics">; status: Doc<"topics">["status"]; notes: string; videoId: Id<"videos"> | null; addedBy: string | null; researchedAt: number; updatedAt: number };

/** Every topic, best opportunities first */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("topics").withIndex("by_score").order("desc").collect();
    return rows.map(view);
  },
});

/** Save / dismiss / mark used, notes, and the script made from it */
export const update = mutation({
  args: { id: v.id("topics"), status: v.optional(topicStatus), notes: v.optional(v.string()), videoId: v.optional(v.union(v.id("videos"), v.null())) },
  handler: async (ctx, { id, status, notes, videoId }) => {
    await requireUser(ctx);
    if (!(await ctx.db.get(id))) throw new ConvexError("This topic was removed");
    await ctx.db.patch(id, {
      ...(status ? { status } : {}),
      ...(notes !== undefined ? { notes: notes.slice(0, 5000) } : {}),
      ...(videoId !== undefined ? { videoId } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("topics") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    await ctx.db.delete(id);
  },
});

// ---------- For agents and the research automation (see agent.ts / mcp.ts) ----------

async function byTitle(ctx: MutationCtx, title: string) {
  const want = title.trim().toLowerCase();
  const exact = await ctx.db
    .query("topics")
    .withIndex("by_title", (q) => q.eq("title", title.trim()))
    .first();
  if (exact) return exact;
  return (await ctx.db.query("topics").collect()).find((t) => t.title.toLowerCase() === want) ?? null;
}

export const listForAgent = internalQuery({
  args: { status: v.optional(topicStatus), query: v.optional(v.string()), full: v.optional(v.boolean()) },
  handler: async (ctx, { status, query: q, full }) => {
    const rows = await ctx.db.query("topics").withIndex("by_score").order("desc").collect();
    const s = q?.trim().toLowerCase();
    return rows
      .filter((t) => (!status || t.status === status) && (!s || `${t.title}\n${t.angle}\n${t.keywords.map((k) => k.term).join("\n")}`.toLowerCase().includes(s)))
      .map((t) => {
        const v = view(t);
        const base = { ...v, researchedAt: new Date(t.researchedAt).toISOString(), updatedAt: new Date(t.updatedAt).toISOString() };
        if (full) return base;
        const { keywords, outliers, hooks, sources, ...rest } = base;
        return { ...rest, keywordCount: keywords.length, outlierCount: outliers.length, hookCount: hooks.length, sourceCount: sources.length };
      });
  },
});

/**
 * Adds researched topics. A topic whose title matches an existing one (ignoring case) is refreshed instead:
 * its research is replaced, but people's status (saved, used, dismissed) and notes stay.
 */
export const upsertForAgent = internalMutation({
  args: { topics: v.array(researchArg), agentName: v.optional(v.string()) },
  handler: async (ctx, { topics, agentName }) => {
    if (topics.length > 60) throw new ConvexError("At most 60 topics at once");
    const now = Date.now();
    const out = [];
    for (const raw of topics) {
      const r = clean(raw);
      const prev = await byTitle(ctx, r.title);
      if (prev) {
        await ctx.db.patch(prev._id, { ...r, researchedAt: now, updatedAt: now });
        out.push({ id: prev._id, title: r.title, result: "refreshed" as const, status: prev.status });
      } else {
        const id = await ctx.db.insert("topics", { ...r, status: "new", addedBy: (agentName?.trim() || "Claude").slice(0, 60), researchedAt: now, createdAt: now, updatedAt: now });
        out.push({ id, title: r.title, result: "added" as const, status: "new" as const });
      }
    }
    return { topics: out };
  },
});

/** Changes one topic: any research fields, its status, or notes */
export const updateForAgent = internalMutation({
  args: {
    topic: v.string(),
    status: v.optional(topicStatus),
    notes: v.optional(v.string()),
    research: v.optional(v.object(Object.fromEntries(Object.entries(research).map(([k, val]) => [k, v.optional(val)])) as { [K in keyof typeof research]: ReturnType<typeof v.optional<(typeof research)[K]>> })),
  },
  handler: async (ctx, { topic, status, notes, research: patch }) => {
    const id = ctx.db.normalizeId("topics", topic);
    const t = id ? await ctx.db.get(id) : await byTitle(ctx, topic);
    if (!t) throw new ConvexError("Topic not found. Use list_topics for ids.");
    const now = Date.now();
    const merged = patch ? clean({ ...(Object.fromEntries(Object.keys(research).map((k) => [k, t[k as keyof Research]])) as Research), ...Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined)) }) : null;
    await ctx.db.patch(t._id, {
      ...(merged ? { ...merged, researchedAt: now } : {}),
      ...(status ? { status } : {}),
      ...(notes !== undefined ? { notes: notes.slice(0, 5000) } : {}),
      updatedAt: now,
    });
    return { id: t._id, title: merged?.title ?? t.title, status: status ?? t.status };
  },
});
