// Edit Feed: short-form videos being edited. An agent adds a video (v1); people comment on it, optionally at a
// moment in the video, and press "Request edits"; the agent reads the comments and adds the next version (v2, v3, …).
// Each video sits in a Kanban column: Editing, Ready to post, Posted.

import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib";
import { resolveAttachments, type AttachmentInput } from "./agentFiles";
import { editAttachment, editStatus } from "./schema";

const MAX_TEXT = 4000;
const site = () => process.env.SITE_URL ?? "";
export const editLink = (id: string) => `${site()}/?view=editfeed&video=${id}`;

async function versionsOf(ctx: QueryCtx, editId: Id<"editVideos">) {
  const rows = await ctx.db
    .query("editVersions")
    .withIndex("by_edit", (q) => q.eq("editId", editId))
    .collect();
  return Promise.all(
    rows.map(async (r) => ({
      id: r._id,
      transcript: r.transcript ?? null,
      number: r.number,
      url: r.storageId ? await ctx.storage.getUrl(r.storageId) : (r.url ?? null),
      mime: r.mime ?? null,
      note: r.note,
      by: r.by,
      agent: r.agent,
      createdAt: r.createdAt,
    })),
  );
}

async function commentsOf(ctx: QueryCtx, editId: Id<"editVideos">) {
  const rows = await ctx.db
    .query("editComments")
    .withIndex("by_edit", (q) => q.eq("editId", editId))
    .collect();
  return Promise.all(rows.map(async (c) => ({
    id: c._id,
    versionNumber: c.versionNumber,
    text: c.text,
    at: c.at ?? null,
    end: c.end ?? null,
    quote: c.quote ?? null,
    attachments: await Promise.all(
      (c.attachments ?? []).map(async (a) => ({ url: a.storageId ? await ctx.storage.getUrl(a.storageId) : (a.url ?? null), mime: a.mime ?? null, name: a.name ?? null })),
    ),
    authorName: c.authorName,
    authorId: c.authorId,
    agent: c.agent,
    resolved: !!c.resolved,
    createdAt: c.createdAt,
  })));
}

// ---------- The app ----------

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("editVideos").withIndex("by_updated").order("desc").collect();
    return Promise.all(
      rows.map(async (e) => {
        const latest = await ctx.db
          .query("editVersions")
          .withIndex("by_edit", (q) => q.eq("editId", e._id).eq("number", e.versionCount))
          .unique();
        const comments = await ctx.db
          .query("editComments")
          .withIndex("by_edit", (q) => q.eq("editId", e._id))
          .collect();
        const onLatest = comments.filter((c) => c.versionNumber === e.versionCount);
        return {
          id: e._id,
          title: e.title,
          status: e.status,
          version: e.versionCount,
          editsRequestedAt: e.editsRequestedAt ?? null,
          videoUrl: latest ? (latest.storageId ? await ctx.storage.getUrl(latest.storageId) : (latest.url ?? null)) : null,
          comments: onLatest.length,
          openComments: onLatest.filter((c) => !c.resolved).length,
          updatedAt: e.updatedAt,
          createdAt: e.createdAt,
        };
      }),
    );
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const editId = ctx.db.normalizeId("editVideos", id);
    const e = editId ? await ctx.db.get(editId) : null;
    if (!e) return null;
    const script = e.scriptId ? await ctx.db.get(e.scriptId) : null;
    return {
      id: e._id,
      title: e.title,
      status: e.status,
      version: e.versionCount,
      editsRequestedAt: e.editsRequestedAt ?? null,
      editsRequestNote: e.editsRequestNote ?? "",
      notes: e.notes ?? "",
      script: script ? { id: script._id, title: script.title } : null,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
      versions: await versionsOf(ctx, e._id),
      comments: await commentsOf(ctx, e._id),
    };
  },
});

async function me(ctx: MutationCtx) {
  const userId = await requireUser(ctx);
  const user = await ctx.db.get(userId);
  return { userId, name: user?.name || user?.email?.split("@")[0] || null };
}

async function mustGet(ctx: QueryCtx, id: Id<"editVideos">) {
  const e = await ctx.db.get(id);
  if (!e) throw new ConvexError("This video was deleted");
  return e;
}

async function insertVersion(
  ctx: MutationCtx,
  e: Doc<"editVideos">,
  file: { url?: string; storageId?: Id<"_storage">; mime?: string },
  note: string,
  by: string | null,
  agent: boolean,
) {
  const number = e.versionCount + 1;
  const now = Date.now();
  const versionId = await ctx.db.insert("editVersions", {
    editId: e._id,
    number,
    ...file,
    note: note.slice(0, MAX_TEXT),
    by,
    agent,
    createdAt: now,
    transcript: { status: "working", words: [], text: "" },
  });
  // Transcribe it straight away (word timings, for the transcript that follows the video)
  await ctx.scheduler.runAfter(0, internal.transcribe.version, { versionId });
  // A new version goes (back) to Editing, and answers any request for edits
  await ctx.db.patch(e._id, { versionCount: number, status: "editing", editsRequestedAt: null, editsRequestNote: "", updatedAt: now });
  return number;
}

/** Upload from the app: a new video (v1) */
export const create = mutation({
  args: { title: v.string(), storageId: v.id("_storage"), mime: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, { title, storageId, mime, note }) => {
    const { name } = await me(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("editVideos", {
      title: title.trim().slice(0, 300) || "Untitled video",
      status: "editing",
      versionCount: 0,
      createdBy: name,
      createdAt: now,
      updatedAt: now,
    });
    await insertVersion(ctx, (await ctx.db.get(id))!, { storageId, mime }, note ?? "", name, false);
    return id;
  },
});

/** Upload from the app: the next version */
export const addVersion = mutation({
  args: { id: v.id("editVideos"), storageId: v.id("_storage"), mime: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, { id, storageId, mime, note }) => {
    const { name } = await me(ctx);
    return insertVersion(ctx, await mustGet(ctx, id), { storageId, mime }, note ?? "", name, false);
  },
});

export const update = mutation({
  args: { id: v.id("editVideos"), title: v.optional(v.string()), status: v.optional(editStatus), notes: v.optional(v.string()) },
  handler: async (ctx, { id, title, status, notes }) => {
    await requireUser(ctx);
    await mustGet(ctx, id);
    await ctx.db.patch(id, {
      ...(title !== undefined ? { title: title.trim().slice(0, 300) || "Untitled video" } : {}),
      ...(status ? { status, archivedAt: status === "archived" ? Date.now() : null } : {}),
      ...(notes !== undefined ? { notes: notes.slice(0, MAX_TEXT) } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** "Make edits": the comments on the latest version are ready for the editor (an agent) to work on */
export const requestEdits = mutation({
  args: { id: v.id("editVideos"), note: v.optional(v.string()) },
  handler: async (ctx, { id, note }) => {
    await requireUser(ctx);
    await mustGet(ctx, id);
    await ctx.db.patch(id, { status: "editing", editsRequestedAt: Date.now(), editsRequestNote: (note ?? "").slice(0, MAX_TEXT), updatedAt: Date.now() });
  },
});

export const cancelEdits = mutation({
  args: { id: v.id("editVideos") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    await ctx.db.patch(id, { editsRequestedAt: null, editsRequestNote: "" });
  },
});

export const remove = mutation({
  args: { id: v.id("editVideos") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    for (const r of await ctx.db.query("editVersions").withIndex("by_edit", (q) => q.eq("editId", id)).collect()) {
      if (r.storageId) await ctx.storage.delete(r.storageId);
      await ctx.db.delete(r._id);
    }
    for (const c of await ctx.db.query("editComments").withIndex("by_edit", (q) => q.eq("editId", id)).collect()) await ctx.db.delete(c._id);
    await ctx.db.delete(id);
  },
});

export const addComment = mutation({
  args: {
    id: v.id("editVideos"),
    versionNumber: v.number(),
    text: v.string(),
    at: v.optional(v.union(v.number(), v.null())),
    end: v.optional(v.union(v.number(), v.null())),
    quote: v.optional(v.string()),
    attachments: v.optional(v.array(editAttachment)),
  },
  handler: async (ctx, { id, versionNumber, text, at, end, quote, attachments }) => {
    const { userId, name } = await me(ctx);
    const e = await mustGet(ctx, id);
    const t = text.trim();
    if (!t && !attachments?.length) throw new ConvexError("Write something first");
    const cid = await ctx.db.insert("editComments", {
      editId: id,
      versionNumber: Math.min(Math.max(1, Math.round(versionNumber)), e.versionCount),
      text: t.slice(0, MAX_TEXT),
      at: at ?? null,
      end: end ?? null,
      ...(quote ? { quote: quote.slice(0, 1000) } : {}),
      ...(attachments?.length ? { attachments: attachments.slice(0, 20) } : {}),
      authorName: name,
      authorId: userId,
      agent: false,
      createdAt: Date.now(),
    });
    await ctx.db.patch(id, { updatedAt: Date.now() });
    return cid;
  },
});

export const updateComment = mutation({
  args: { id: v.id("editComments"), text: v.optional(v.string()), resolved: v.optional(v.boolean()) },
  handler: async (ctx, { id, text, resolved }) => {
    const userId = await requireUser(ctx);
    const c = await ctx.db.get(id);
    if (!c) return;
    if (text !== undefined && c.authorId !== userId) throw new ConvexError("Only the author can change this comment");
    await ctx.db.patch(id, { ...(text !== undefined ? { text: text.slice(0, MAX_TEXT) } : {}), ...(resolved !== undefined ? { resolved } : {}) });
  },
});

export const removeComment = mutation({
  args: { id: v.id("editComments") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    await ctx.db.delete(id);
  },
});

// ---------- For agents (see mcp.ts / agent.ts) ----------

async function findEdit(ctx: QueryCtx, video: string) {
  const s = video.trim();
  const fromLink = s.match(/[?&]video=([\w-]+)/)?.[1] ?? s;
  const id = ctx.db.normalizeId("editVideos", fromLink);
  const byId = id ? await ctx.db.get(id) : null;
  if (byId) return byId;
  const all = await ctx.db.query("editVideos").collect();
  const q = s.toLowerCase();
  const hit = all.find((e) => e.title.toLowerCase() === q) ?? all.find((e) => e.title.toLowerCase().includes(q));
  if (!hit) throw new ConvexError("Edit Feed video not found. Use list_edit_videos for ids.");
  return hit;
}

export const listForAgent = internalQuery({
  args: { status: v.optional(editStatus), editsRequested: v.optional(v.boolean()) },
  handler: async (ctx, { status, editsRequested }) => {
    const rows = await ctx.db.query("editVideos").withIndex("by_updated").order("desc").collect();
    const out = [];
    for (const e of rows) {
      if (status ? e.status !== status : e.status === "archived") continue;
      if (editsRequested !== undefined && !!e.editsRequestedAt !== editsRequested) continue;
      const comments = (await ctx.db.query("editComments").withIndex("by_edit", (q) => q.eq("editId", e._id)).collect()).filter(
        (c) => c.versionNumber === e.versionCount && !c.resolved,
      );
      out.push({
        id: e._id,
        title: e.title,
        status: e.status,
        version: e.versionCount,
        editsRequested: !!e.editsRequestedAt,
        editsRequestedAt: e.editsRequestedAt ? new Date(e.editsRequestedAt).toISOString() : null,
        openCommentsOnLatest: comments.length,
        updatedAt: new Date(e.updatedAt).toISOString(),
        link: editLink(e._id),
      });
    }
    return out;
  },
});

export const getForAgent = internalQuery({
  args: { video: v.string() },
  handler: async (ctx, { video }) => {
    const e = await findEdit(ctx, video);
    const script = e.scriptId ? await ctx.db.get(e.scriptId) : null;
    const versions = await versionsOf(ctx, e._id);
    const comments = await commentsOf(ctx, e._id);
    return {
      id: e._id,
      title: e.title,
      status: e.status,
      version: e.versionCount,
      link: editLink(e._id),
      editsRequested: !!e.editsRequestedAt,
      editsRequestNote: e.editsRequestNote || null,
      notes: e.notes || null,
      script: script ? { id: script._id, title: script.title } : null,
      versions: versions.map((x) => ({
        version: x.number,
        videoUrl: x.url,
        mime: x.mime,
        note: x.note,
        by: x.by,
        agent: x.agent,
        createdAt: new Date(x.createdAt).toISOString(),
        // What's said, in timed lines (seconds), so edits can be found by what's said
        transcript: x.transcript?.status === "done" ? segments(x.transcript.words) : x.transcript ? x.transcript.status : null,
      })),
      // What to change: the open comments on the latest version, in video order (timed ones first)
      toDo: comments
        .filter((c) => c.versionNumber === e.versionCount && !c.resolved)
        .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || a.createdAt - b.createdAt)
        .map((c) => ({ id: c.id, at: c.at, end: c.end, quote: c.quote, text: c.text, by: c.authorName, agent: c.agent, attachments: c.attachments })),
      comments: comments.map((c) => ({
        id: c.id,
        version: c.versionNumber,
        at: c.at,
        end: c.end,
        quote: c.quote,
        text: c.text,
        by: c.authorName,
        agent: c.agent,
        resolved: c.resolved,
        attachments: c.attachments,
        createdAt: new Date(c.createdAt).toISOString(),
      })),
      archived: e.status === "archived" ? { at: e.archivedAt ? new Date(e.archivedAt).toISOString() : null, why: "See the comments: they say why this video was dropped." } : null,
    };
  },
});

const fileArg = v.object({ url: v.optional(v.string()), storageId: v.optional(v.id("_storage")), mime: v.optional(v.string()) });

export const createInternal = internalMutation({
  args: { title: v.string(), file: fileArg, note: v.optional(v.string()), script: v.optional(v.string()), agentName: v.optional(v.string()) },
  handler: async (ctx, { title, file, note, script, agentName }) => {
    const now = Date.now();
    let scriptId: Id<"videos"> | null = null;
    if (script) {
      scriptId = ctx.db.normalizeId("videos", script) ?? (await ctx.db.query("videos").withIndex("by_slug", (q) => q.eq("shareSlug", script.split("/").pop() ?? script)).unique())?._id ?? null;
      if (!scriptId) throw new ConvexError("Script not found. Pass its id or share link, or leave script out.");
    }
    const by = agentName?.trim().slice(0, 80) || "Agent";
    const id = await ctx.db.insert("editVideos", { title: title.trim().slice(0, 300) || "Untitled video", status: "editing", versionCount: 0, scriptId, createdBy: by, createdAt: now, updatedAt: now });
    await insertVersion(ctx, (await ctx.db.get(id))!, file, note ?? "", by, true);
    return { id, version: 1, link: editLink(id) };
  },
});

export const addVersionInternal = internalMutation({
  args: { video: v.string(), file: fileArg, note: v.optional(v.string()), agentName: v.optional(v.string()), resolveComments: v.optional(v.boolean()) },
  handler: async (ctx, { video, file, note, agentName, resolveComments }) => {
    const e = await findEdit(ctx, video);
    // The comments that were asked for are done once the new version is in (unless told not to)
    if (resolveComments !== false)
      for (const c of await ctx.db.query("editComments").withIndex("by_edit", (q) => q.eq("editId", e._id)).collect())
        if (c.versionNumber === e.versionCount && !c.resolved) await ctx.db.patch(c._id, { resolved: true });
    const number = await insertVersion(ctx, e, file, note ?? "", agentName?.trim().slice(0, 80) || "Agent", true);
    return { id: e._id, version: number, link: editLink(e._id) };
  },
});

export const commentForAgent = internalMutation({
  args: {
    video: v.string(),
    text: v.string(),
    version: v.optional(v.number()),
    at: v.optional(v.union(v.number(), v.null())),
    agentName: v.optional(v.string()),
    attachments: v.optional(v.array(editAttachment)),
  },
  handler: async (ctx, { video, text, version, at, agentName, attachments }) => {
    const e = await findEdit(ctx, video);
    const t = text.trim();
    if (!t) throw new ConvexError("text is empty");
    const n = version ? Math.min(Math.max(1, Math.round(version)), e.versionCount) : e.versionCount;
    const id = await ctx.db.insert("editComments", {
      editId: e._id,
      versionNumber: n,
      text: t.slice(0, MAX_TEXT),
      at: at ?? null,
      ...(attachments?.length ? { attachments } : {}),
      authorName: agentName?.trim().slice(0, 80) || "Agent",
      authorId: null,
      agent: true,
      createdAt: Date.now(),
    });
    await ctx.db.patch(e._id, { updatedAt: Date.now() });
    return { id, version: n };
  },
});

export const setStatusForAgent = internalMutation({
  args: { video: v.string(), status: editStatus },
  handler: async (ctx, { video, status }) => {
    const e = await findEdit(ctx, video);
    await ctx.db.patch(e._id, { status, updatedAt: Date.now() });
    return { id: e._id, status };
  },
});

/** Turns what an agent sends for the video file into a stored file or link */
export async function resolveVideoFile(ctx: ActionCtx, video: AttachmentInput | undefined) {
  if (!video || (!video.url && !video.base64 && !video.storageId)) throw new ConvexError("Send the video: {url} or {storageId} (from get_upload_url) or {base64, name}");
  const [r] = await resolveAttachments(ctx, [video]);
  return { url: r.url, storageId: r.storageId, mime: r.mime ?? (r.url && /\.(mov)(\?|$)/i.test(r.url) ? "video/quicktime" : r.url ? "video/mp4" : undefined) };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const agentAddVideo = async (ctx: ActionCtx, a: any) =>
  ctx.runMutation(internal.editFeed.createInternal, { title: String(a.title ?? ""), file: await resolveVideoFile(ctx, a.video), note: a.note, script: a.script, agentName: a.agentName });
export const agentComment = async (ctx: ActionCtx, a: any) => {
  const files = a.attachments?.length ? await resolveAttachments(ctx, a.attachments) : [];
  return ctx.runMutation(internal.editFeed.commentForAgent, {
    video: String(a.video ?? ""),
    text: String(a.text ?? ""),
    version: a.version,
    at: a.at,
    agentName: a.agentName,
    attachments: files.map((f) => ({ storageId: f.storageId, url: f.url, mime: f.mime, name: f.name })),
  });
};
export const agentAddVersion = async (ctx: ActionCtx, a: any) =>
  ctx.runMutation(internal.editFeed.addVersionInternal, { video: String(a.video ?? ""), file: await resolveVideoFile(ctx, a.file), note: a.note, agentName: a.agentName, resolveComments: a.resolveComments });
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Words grouped into short timed lines (a new line after a pause or at a sentence end once it's long enough) */
export function segments(words: { w: string; s: number; e: number }[]) {
  const out: { start: number; end: number; text: string }[] = [];
  let cur: typeof words = [];
  const flush = () => {
    if (cur.length) out.push({ start: cur[0].s, end: cur[cur.length - 1].e, text: cur.map((x) => x.w).join(" ") });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.s - prev.e > 1 || (/[.!?]$/.test(prev.w) && cur.length >= 8) || cur.length >= 24)) flush();
    cur.push(w);
  }
  flush();
  return out;
}

/** Try transcribing a version again (e.g. after a transcription key was added) */
export const retranscribe = mutation({
  args: { versionId: v.id("editVersions") },
  handler: async (ctx, { versionId }) => {
    await requireUser(ctx);
    await ctx.db.patch(versionId, { transcript: { status: "working", words: [], text: "" } });
    await ctx.scheduler.runAfter(0, internal.transcribe.version, { versionId });
  },
});
