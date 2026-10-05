import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
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

const researchOf = (t: Research) => Object.fromEntries(Object.keys(research).map((k) => [k, t[k as keyof Research]])) as Research;

/** The two latest snapshots of a topic (newest first) */
const lastTwo = (ctx: QueryCtx, topicId: Id<"topics">) =>
  ctx.db
    .query("topicSnapshots")
    .withIndex("by_topic", (q) => q.eq("topicId", topicId))
    .order("desc")
    .take(2);

/** Every topic, best opportunities first, with what changed in the latest research */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("topics").withIndex("by_score").order("desc").collect();
    const latest = await ctx.db.query("topicRuns").withIndex("by_started").order("desc").first();
    // In the very first research everything is new, so nothing gets the badge
    const first = await ctx.db.query("topicRuns").withIndex("by_started").order("asc").first();
    return Promise.all(
      rows.map(async (t) => {
        const snaps = await lastTwo(ctx, t._id);
        const now = snaps[0] as Doc<"topicSnapshots"> | undefined;
        const before = snaps[1] as Doc<"topicSnapshots"> | undefined;
        return {
          ...view(t),
          /** First found in the latest research */
          isNew: !!latest && latest._id !== first?._id && !!now && now.runId === latest._id && !before,
          /** Score in the research before this one (null when there's nothing to compare) */
          prevScore: now && before && now.runId !== before.runId ? before.score : null,
          /** Not looked at again in the latest research */
          stale: !!latest && (!now || now.runId !== latest._id),
          versions: (await ctx.db
            .query("topicSnapshots")
            .withIndex("by_topic", (q) => q.eq("topicId", t._id))
            .collect()).length,
        };
      }),
    );
  },
});

/** Research runs, newest first (to look at earlier research) */
export const runs = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("topicRuns").withIndex("by_started").order("desc").take(100);
    return rows.map((r) => ({ id: r._id, agentName: r.agentName, startedAt: r.startedAt, finishedAt: r.finishedAt ?? null, summary: r.summary ?? "", added: r.added, refreshed: r.refreshed }));
  },
});

/** Topics as they stood after an earlier run (only topics that existed then) */
export const asOf = query({
  args: { run: v.id("topicRuns") },
  handler: async (ctx, { run }) => {
    await requireUser(ctx);
    const r = await ctx.db.get(run);
    if (!r) return [];
    // Everything up to the end of that run (a run still going counts up to now)
    const until = r.finishedAt ?? Date.now();
    const first = await ctx.db.query("topicRuns").withIndex("by_started").order("asc").first();
    const rows = await ctx.db.query("topics").collect();
    const out = [];
    for (const t of rows) {
      const snap = await ctx.db
        .query("topicSnapshots")
        .withIndex("by_topic", (q) => q.eq("topicId", t._id).lte("takenAt", until))
        .order("desc")
        .first();
      if (!snap) continue;
      const earlier = await ctx.db
        .query("topicSnapshots")
        .withIndex("by_topic", (q) => q.eq("topicId", t._id).lt("takenAt", snap.takenAt))
        .order("desc")
        .first();
      out.push({
        ...view(t),
        ...researchOf(snap),
        researchedAt: snap.takenAt,
        isNew: snap.runId === run && run !== first?._id && !earlier,
        prevScore: snap.runId === run && earlier ? earlier.score : null,
        stale: snap.runId !== run,
        versions: 0,
      });
    }
    return out.sort((a, b) => b.score - a.score);
  },
});

/** Every version of one topic's research, newest first */
export const history = query({
  args: { id: v.id("topics") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const snaps = await ctx.db
      .query("topicSnapshots")
      .withIndex("by_topic", (q) => q.eq("topicId", id))
      .order("desc")
      .collect();
    return Promise.all(snaps.map(async (s) => ({ id: s._id, takenAt: s.takenAt, run: (await ctx.db.get(s.runId))?.agentName ?? "", ...researchOf(s) })));
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
        // mightDo = Riley marked it as something he might make (status "saved")
        const base = { ...v, mightDo: t.status === "saved", researchedAt: new Date(t.researchedAt).toISOString(), updatedAt: new Date(t.updatedAt).toISOString() };
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
/**
 * History starts the first time research runs with it: whatever was there before is kept as one "earlier
 * research" run, so nothing that existed is lost.
 */
async function ensureBaseline(ctx: MutationCtx) {
  if (await ctx.db.query("topicRuns").first()) return;
  const rows = await ctx.db.query("topics").collect();
  if (!rows.length) return;
  const at = Math.min(...rows.map((t) => t.researchedAt));
  const runId = await ctx.db.insert("topicRuns", {
    agentName: rows[0].addedBy ?? "Claude",
    startedAt: at,
    finishedAt: Math.max(...rows.map((t) => t.researchedAt)),
    summary: "Earlier research, from before each run was kept.",
    added: rows.length,
    refreshed: 0,
  });
  for (const t of rows) await ctx.db.insert("topicSnapshots", { topicId: t._id, runId, ...researchOf(t), takenAt: t.researchedAt });
}

/** The run these changes belong to: the one named, or a new one */
async function runFor(ctx: MutationCtx, run: string | undefined, agentName: string | undefined) {
  if (run) {
    const id = ctx.db.normalizeId("topicRuns", run);
    const r = id ? await ctx.db.get(id) : null;
    if (!r) throw new ConvexError("Run not found. Leave run out to start a new one.");
    return r;
  }
  const id = await ctx.db.insert("topicRuns", { agentName: (agentName?.trim() || "Claude").slice(0, 60), startedAt: Date.now(), added: 0, refreshed: 0 });
  return (await ctx.db.get(id))!;
}

export const upsertForAgent = internalMutation({
  args: { topics: v.array(researchArg), agentName: v.optional(v.string()), run: v.optional(v.string()) },
  handler: async (ctx, { topics, agentName, run }) => {
    if (topics.length > 60) throw new ConvexError("At most 60 topics at once");
    await ensureBaseline(ctx);
    const r0 = await runFor(ctx, run, agentName);
    const now = Date.now();
    const out = [];
    let added = 0;
    let refreshed = 0;
    for (const raw of topics) {
      const r = clean(raw);
      const prev = await byTitle(ctx, r.title);
      if (prev) {
        // The earlier research stays in the topic's history; the topic shows the newest
        await ctx.db.patch(prev._id, { ...r, researchedAt: now, updatedAt: now });
        await ctx.db.insert("topicSnapshots", { topicId: prev._id, runId: r0._id, ...r, takenAt: now });
        refreshed++;
        out.push({ id: prev._id, title: r.title, result: "refreshed" as const, status: prev.status, previousScore: prev.score });
      } else {
        const id = await ctx.db.insert("topics", { ...r, status: "new", addedBy: (agentName?.trim() || "Claude").slice(0, 60), researchedAt: now, createdAt: now, updatedAt: now });
        await ctx.db.insert("topicSnapshots", { topicId: id, runId: r0._id, ...r, takenAt: now });
        added++;
        out.push({ id, title: r.title, result: "added" as const, status: "new" as const });
      }
    }
    await ctx.db.patch(r0._id, { added: r0.added + added, refreshed: r0.refreshed + refreshed });
    return {
      run: r0._id,
      topics: out,
      note: "Pass this run id to further add_topics calls in the same research pass, then call finish_topic_run with a short summary.",
    };
  },
});

/** Ends a research run with a short summary of what changed (shown in the app) */
export const finishRunForAgent = internalMutation({
  args: { run: v.string(), summary: v.string() },
  handler: async (ctx, { run, summary }) => {
    const id = ctx.db.normalizeId("topicRuns", run);
    const r = id ? await ctx.db.get(id) : null;
    if (!r) throw new ConvexError("Run not found");
    await ctx.db.patch(r._id, { finishedAt: Date.now(), summary: summary.trim().slice(0, 4000) });
    return { run: r._id, added: r.added, refreshed: r.refreshed };
  },
});

export const runsForAgent = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("topicRuns").withIndex("by_started").order("desc").take(50);
    return rows.map((r) => ({
      id: r._id,
      agentName: r.agentName,
      startedAt: new Date(r.startedAt).toISOString(),
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
      summary: r.summary ?? "",
      added: r.added,
      refreshed: r.refreshed,
    }));
  },
});

export const historyForAgent = internalQuery({
  args: { topic: v.string() },
  handler: async (ctx, { topic }) => {
    const id = ctx.db.normalizeId("topics", topic);
    const t = id ? await ctx.db.get(id) : (await ctx.db.query("topics").collect()).find((x) => x.title.toLowerCase() === topic.trim().toLowerCase());
    if (!t) throw new ConvexError("Topic not found. Use list_topics for ids.");
    const snaps = await ctx.db
      .query("topicSnapshots")
      .withIndex("by_topic", (q) => q.eq("topicId", t._id))
      .order("desc")
      .collect();
    return {
      id: t._id,
      title: t.title,
      status: t.status,
      versions: snaps.map((s) => ({ at: new Date(s.takenAt).toISOString(), run: s.runId, score: s.score, trend: s.trend, demand: s.demand, competition: s.competition, whyNow: s.whyNow, outliers: s.outliers })),
    };
  },
});

/** Changes one topic: any research fields, its status, or notes */
export const updateForAgent = internalMutation({
  args: {
    topic: v.string(),
    run: v.optional(v.string()),
    agentName: v.optional(v.string()),
    status: v.optional(topicStatus),
    notes: v.optional(v.string()),
    research: v.optional(v.object(Object.fromEntries(Object.entries(research).map(([k, val]) => [k, v.optional(val)])) as { [K in keyof typeof research]: ReturnType<typeof v.optional<(typeof research)[K]>> })),
  },
  handler: async (ctx, { topic, status, notes, research: patch, run, agentName }) => {
    const id = ctx.db.normalizeId("topics", topic);
    const t = id ? await ctx.db.get(id) : await byTitle(ctx, topic);
    if (!t) throw new ConvexError("Topic not found. Use list_topics for ids.");
    const now = Date.now();
    const merged = patch ? clean({ ...researchOf(t), ...Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined)) }) : null;
    if (merged) {
      // A research change is kept as a new version too (in the given run, or the latest one)
      await ensureBaseline(ctx);
      const latest = run ? null : await ctx.db.query("topicRuns").withIndex("by_started").order("desc").first();
      const r0 = latest ?? (await runFor(ctx, run, agentName));
      await ctx.db.insert("topicSnapshots", { topicId: t._id, runId: r0._id, ...merged, takenAt: now });
    }
    await ctx.db.patch(t._id, {
      ...(merged ? { ...merged, researchedAt: now } : {}),
      ...(status ? { status } : {}),
      ...(notes !== undefined ? { notes: notes.slice(0, 5000) } : {}),
      updatedAt: now,
    });
    return { id: t._id, title: merged?.title ?? t.title, status: status ?? t.status };
  },
});
