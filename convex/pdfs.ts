// The PDFs app: papers and documents to read in Native Note, with highlights, comments and notes (typed or
// spoken) on any spot or page. Agents can add PDFs (from a link, an upload or base64) and leave notes.

import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib";

const MAX_PDF = 200 * 1024 * 1024;
const link = (id: string) => `${process.env.SITE_URL ?? ""}/pdf/${id}`;
const idOf = (s: string) => s.trim().replace(/[?#].*$/, "").split("/").filter(Boolean).pop() ?? "";
const rect = v.object({ x: v.number(), y: v.number(), w: v.number(), h: v.number() });
const frac = (n: number | undefined) => (n === undefined ? undefined : Math.max(0, Math.min(1, n)));

async function nameOf(ctx: QueryCtx, userId: Id<"users"> | null) {
  const u = userId ? await ctx.db.get(userId) : null;
  return u?.name?.trim() || u?.email?.split("@")[0] || "Someone";
}

async function notesOf(ctx: QueryCtx, pdfId: Id<"pdfs">) {
  const rows = await ctx.db
    .query("pdfNotes")
    .withIndex("by_pdf", (q) => q.eq("pdfId", pdfId))
    .collect();
  return Promise.all(
    rows.map(async (n) => ({
      id: n._id,
      page: n.page,
      kind: n.kind,
      quote: n.quote ?? null,
      rects: n.rects ?? null,
      x: n.x ?? null,
      y: n.y ?? null,
      color: n.color ?? null,
      text: n.text,
      audioUrl: n.audio ? await ctx.storage.getUrl(n.audio.storageId) : null,
      seconds: n.audio?.seconds ?? null,
      transcript: n.transcript ?? null,
      authorId: n.authorId,
      authorName: n.authorName,
      agent: n.agent,
      createdAt: n.createdAt,
    })),
  );
}

// ---------- The app ----------

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("pdfs").withIndex("by_updated").order("desc").collect();
    return Promise.all(
      rows.map(async (p) => ({
        id: p._id,
        title: p.title,
        pages: p.pages ?? null,
        size: p.size,
        authors: p.authors ?? null,
        about: p.about ?? null,
        sourceUrl: p.sourceUrl ?? null,
        addedBy: p.addedBy ?? null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        notes: (await ctx.db.query("pdfNotes").withIndex("by_pdf", (q) => q.eq("pdfId", p._id)).collect()).length,
      })),
    );
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const pid = ctx.db.normalizeId("pdfs", id);
    const p = pid ? await ctx.db.get(pid) : null;
    if (!p) return null;
    return {
      id: p._id,
      title: p.title,
      url: await ctx.storage.getUrl(p.storageId),
      pages: p.pages ?? null,
      size: p.size,
      authors: p.authors ?? null,
      about: p.about ?? null,
      sourceUrl: p.sourceUrl ?? null,
      lastPage: p.lastPage ?? null,
      notes: await notesOf(ctx, p._id),
    };
  },
});

export const create = mutation({
  args: { storageId: v.id("_storage"), title: v.string(), pages: v.optional(v.number()) },
  handler: async (ctx, { storageId, title, pages }) => {
    const userId = await requireUser(ctx);
    const f = await ctx.db.system.get(storageId);
    if (!f) throw new ConvexError("That upload didn't arrive. Try again.");
    const now = Date.now();
    return ctx.db.insert("pdfs", { title: title.trim().slice(0, 300) || "Untitled PDF", storageId, size: f.size, pages, createdBy: userId, createdAt: now, updatedAt: now });
  },
});

export const update = mutation({
  args: { id: v.id("pdfs"), title: v.optional(v.string()), pages: v.optional(v.number()), lastPage: v.optional(v.number()), authors: v.optional(v.string()), about: v.optional(v.string()) },
  handler: async (ctx, { id, title, pages, lastPage, authors, about }) => {
    await requireUser(ctx);
    const p = await ctx.db.get(id);
    if (!p) return;
    const patch: Partial<Doc<"pdfs">> = {};
    if (title !== undefined) patch.title = title.trim().slice(0, 300) || "Untitled PDF";
    if (pages !== undefined && pages > 0) patch.pages = Math.round(pages);
    if (lastPage !== undefined) patch.lastPage = Math.max(1, Math.round(lastPage));
    if (authors !== undefined) patch.authors = authors.slice(0, 500);
    if (about !== undefined) patch.about = about.slice(0, 2000);
    // Reading doesn't count as a change (the list stays in the order things were added or edited)
    if (title !== undefined || authors !== undefined || about !== undefined) patch.updatedAt = Date.now();
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("pdfs") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const p = await ctx.db.get(id);
    if (!p) return;
    for (const n of await ctx.db.query("pdfNotes").withIndex("by_pdf", (q) => q.eq("pdfId", id)).collect()) {
      if (n.audio) await ctx.storage.delete(n.audio.storageId);
      await ctx.db.delete(n._id);
    }
    await ctx.storage.delete(p.storageId);
    await ctx.db.delete(id);
  },
});

// ---------- Highlights and notes ----------

async function insertNote(
  ctx: MutationCtx,
  a: { pdfId: Id<"pdfs">; page: number; kind: "highlight" | "note"; quote?: string; rects?: { x: number; y: number; w: number; h: number }[]; x?: number; y?: number; color?: string; text: string; audio?: Doc<"pdfNotes">["audio"] },
  author: { id: Id<"users"> | null; name: string; agent: boolean },
) {
  const p = await ctx.db.get(a.pdfId);
  if (!p) throw new ConvexError("PDF not found. Use list_pdfs for ids.");
  if (!Number.isFinite(a.page) || a.page < 1 || (p.pages && a.page > p.pages)) throw new ConvexError(`Page must be between 1 and ${p.pages ?? "the last page"}`);
  if (a.text.length > 20000) throw new ConvexError("Notes can be at most 20,000 characters");
  if ((a.rects?.length ?? 0) > 200) throw new ConvexError("Too many highlight boxes");
  const now = Date.now();
  const id = await ctx.db.insert("pdfNotes", {
    pdfId: a.pdfId,
    page: Math.round(a.page),
    kind: a.kind,
    ...(a.quote ? { quote: a.quote.slice(0, 5000) } : {}),
    ...(a.rects?.length ? { rects: a.rects.map((r) => ({ x: frac(r.x)!, y: frac(r.y)!, w: frac(r.w)!, h: frac(r.h)! })) } : {}),
    ...(a.x !== undefined ? { x: frac(a.x) } : {}),
    ...(a.y !== undefined ? { y: frac(a.y) } : {}),
    ...(a.color ? { color: a.color.slice(0, 20) } : {}),
    text: a.text,
    ...(a.audio ? { audio: a.audio } : {}),
    authorId: author.id,
    authorName: author.name,
    agent: author.agent,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(a.pdfId, { updatedAt: now });
  return id;
}

export const addNote = mutation({
  args: {
    pdfId: v.id("pdfs"),
    page: v.number(),
    kind: v.union(v.literal("highlight"), v.literal("note")),
    quote: v.optional(v.string()),
    rects: v.optional(v.array(rect)),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    color: v.optional(v.string()),
    text: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    seconds: v.optional(v.number()),
    mime: v.optional(v.string()),
  },
  handler: async (ctx, { audioStorageId, seconds, mime, ...a }) => {
    const userId = await requireUser(ctx);
    const id = await insertNote(ctx, { ...a, ...(audioStorageId ? { audio: { storageId: audioStorageId, seconds, mime } } : {}) }, { id: userId, name: await nameOf(ctx, userId), agent: false });
    // A voice note gets written out, so it can be read and searched (when a speech-to-text key is set up)
    if (audioStorageId) await ctx.scheduler.runAfter(0, internal.transcribe.pdfVoiceNote, { noteId: id });
    return id;
  },
});

export const updateNote = mutation({
  args: { id: v.id("pdfNotes"), text: v.optional(v.string()), color: v.optional(v.string()), audioStorageId: v.optional(v.id("_storage")), seconds: v.optional(v.number()), mime: v.optional(v.string()) },
  handler: async (ctx, { id, text, color, audioStorageId, seconds, mime }) => {
    await requireUser(ctx);
    const n = await ctx.db.get(id);
    if (!n) return;
    if (text !== undefined && text.length > 20000) throw new ConvexError("Notes can be at most 20,000 characters");
    // A recording added to a note (replacing any earlier one)
    if (audioStorageId && n.audio && n.audio.storageId !== audioStorageId) await ctx.storage.delete(n.audio.storageId);
    await ctx.db.patch(id, {
      ...(text !== undefined ? { text } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(audioStorageId ? { audio: { storageId: audioStorageId, seconds, mime }, transcript: undefined } : {}),
      updatedAt: Date.now(),
    });
    if (audioStorageId) await ctx.scheduler.runAfter(0, internal.transcribe.pdfVoiceNote, { noteId: id });
  },
});

export const removeNote = mutation({
  args: { id: v.id("pdfNotes") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const n = await ctx.db.get(id);
    if (!n) return;
    if (n.audio) await ctx.storage.delete(n.audio.storageId);
    await ctx.db.delete(id);
  },
});

/** For the voice note transcriber */
export const voiceNoteFile = internalQuery({
  args: { noteId: v.id("pdfNotes") },
  handler: async (ctx, { noteId }) => {
    const n = await ctx.db.get(noteId);
    return n?.audio ? { url: await ctx.storage.getUrl(n.audio.storageId), mime: n.audio.mime ?? null } : null;
  },
});
export const saveTranscript = internalMutation({
  args: { noteId: v.id("pdfNotes"), transcript: v.string() },
  handler: async (ctx, { noteId, transcript }) => {
    const n = await ctx.db.get(noteId);
    if (n) await ctx.db.patch(noteId, { transcript: transcript.slice(0, 20000) });
  },
});

// ---------- Adding PDFs from a link (agents, and "Add from link" in the app) ----------

/** arxiv.org/abs/2501.12345 → its PDF; other links as they are */
function pdfLink(url: string) {
  const u = url.trim();
  const arxiv = u.match(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf|html)\/([\w.\-/]+?)(?:v\d+)?(?:\.pdf)?\/?$/i);
  if (arxiv) return `https://arxiv.org/pdf/${arxiv[1]}`;
  const gh = u.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+\.pdf)$/i);
  if (gh) return `https://github.com/${gh[1]}/raw/${gh[2]}`;
  return u;
}

/** Rough page count straight from the file (the reader fills in the exact one when it's opened) */
function countPages(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes);
  const m = text.match(/\/Type\s*\/Page(?![s\w])/g);
  return m?.length || undefined;
}

export const insertFromAgent = internalMutation({
  args: { storageId: v.id("_storage"), title: v.string(), size: v.number(), pages: v.optional(v.number()), sourceUrl: v.optional(v.string()), authors: v.optional(v.string()), about: v.optional(v.string()), addedBy: v.optional(v.string()), userId: v.optional(v.id("users")) },
  handler: async (ctx, a) => {
    const now = Date.now();
    const id = await ctx.db.insert("pdfs", {
      title: a.title.trim().slice(0, 300) || "Untitled PDF",
      storageId: a.storageId,
      size: a.size,
      ...(a.pages ? { pages: a.pages } : {}),
      ...(a.sourceUrl ? { sourceUrl: a.sourceUrl.slice(0, 1000) } : {}),
      ...(a.authors ? { authors: a.authors.slice(0, 500) } : {}),
      ...(a.about ? { about: a.about.slice(0, 2000) } : {}),
      createdBy: a.userId ?? null,
      ...(a.addedBy ? { addedBy: a.addedBy.slice(0, 80) } : {}),
      createdAt: now,
      updatedAt: now,
    });
    return { id, url: link(id) };
  },
});

type AddArgs = { url?: string; base64?: string; storageId?: string; title?: string; authors?: string; about?: string; agentName?: string };

async function fetchPdf(url: string) {
  const target = pdfLink(url);
  if (!/^https?:\/\//i.test(target)) throw new ConvexError("The link must start with http:// or https://");
  const res = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 (Native Note PDF fetcher)", Accept: "application/pdf,*/*" }, redirect: "follow" });
  if (!res.ok) throw new ConvexError(`Couldn't download the PDF (${res.status} from ${new URL(target).host})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, sourceUrl: url.trim(), finalUrl: res.url || target };
}

function checkPdf(bytes: Uint8Array) {
  if (bytes.length > MAX_PDF) throw new ConvexError("PDFs can be at most 200 MB");
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 1024));
  if (!head.includes("%PDF")) throw new ConvexError("That isn't a PDF (find the direct link to the .pdf file; for arXiv the abs page link works too)");
}

/** The title from the PDF's own info, if it has one */
function titleFromPdf(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 2_000_000)));
  const m = text.match(/\/Title\s*\(([^)]{3,300})\)/);
  const t = m?.[1]?.replace(/\\\(/g, "(").replace(/\\\)/g, ")").trim();
  return t && !/^untitled|microsoft word|^\s*$/i.test(t) ? t : undefined;
}

async function addPdf(ctx: ActionCtx, a: AddArgs, userId?: Id<"users">) {
  let bytes: Uint8Array;
  let sourceUrl: string | undefined;
  let storageId: Id<"_storage">;
  if (a.storageId) {
    const info = await ctx.runQuery(internal.agentFiles.fileInfo, { storageId: a.storageId });
    if (!info) throw new ConvexError(`No uploaded file with storageId ${a.storageId}. Upload it with get_upload_url first.`);
    const blob = await ctx.storage.get(info.id);
    if (!blob) throw new ConvexError("That upload is empty");
    bytes = new Uint8Array(await blob.arrayBuffer());
    checkPdf(bytes);
    storageId = info.id;
  } else {
    if (a.url) {
      const got = await fetchPdf(a.url);
      bytes = got.bytes;
      sourceUrl = got.sourceUrl;
    } else if (a.base64) {
      const raw = a.base64.replace(/^data:[^,]*,/, "");
      bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    } else throw new ConvexError("Give the PDF as url (a link to it), storageId (an upload) or base64");
    checkPdf(bytes);
    storageId = await ctx.storage.store(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  }
  const fromUrl = sourceUrl ? decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() ?? "").replace(/\.pdf$/i, "") : "";
  const title = a.title?.trim() || titleFromPdf(bytes) || fromUrl || "Untitled PDF";
  return ctx.runMutation(internal.pdfs.insertFromAgent, {
    storageId,
    title,
    size: bytes.length,
    pages: countPages(bytes),
    sourceUrl,
    authors: a.authors,
    about: a.about,
    addedBy: a.agentName ?? (userId ? undefined : "Agent"),
    userId,
  });
}

const addArgs = { url: v.optional(v.string()), base64: v.optional(v.string()), storageId: v.optional(v.string()), title: v.optional(v.string()), authors: v.optional(v.string()), about: v.optional(v.string()), agentName: v.optional(v.string()) };

/** Agents: add a PDF */
export const addForAgent = internalAction({
  args: addArgs,
  handler: async (ctx, a): Promise<{ id: Id<"pdfs">; url: string }> => addPdf(ctx, a),
});

/** The app's "Add from link" */
export const addFromLink = action({
  args: { url: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, { url, title }): Promise<{ id: Id<"pdfs">; url: string }> => {
    const userId = await ctx.runQuery(internal.pdfs.me, {});
    if (!userId) throw new ConvexError("Not signed in");
    return addPdf(ctx, { url, title }, userId);
  },
});
export const me = internalQuery({
  args: {},
  handler: async (ctx) => {
    try {
      return await requireUser(ctx);
    } catch {
      return null;
    }
  },
});

// ---------- Agents reading and noting ----------

export const listForAgent = internalQuery({
  args: { query: v.optional(v.string()) },
  handler: async (ctx, { query: q }) => {
    const s = q?.trim().toLowerCase();
    const rows = await ctx.db.query("pdfs").withIndex("by_updated").order("desc").collect();
    return rows
      .filter((p) => !s || `${p.title}\n${p.authors ?? ""}\n${p.about ?? ""}`.toLowerCase().includes(s))
      .map((p) => ({ id: p._id, title: p.title, pages: p.pages ?? null, authors: p.authors ?? null, about: p.about ?? null, sourceUrl: p.sourceUrl ?? null, url: link(p._id), addedAt: new Date(p.createdAt).toISOString() }));
  },
});

export const getForAgent = internalQuery({
  args: { pdf: v.string() },
  handler: async (ctx, { pdf }) => {
    const id = ctx.db.normalizeId("pdfs", idOf(pdf));
    const p = id ? await ctx.db.get(id) : null;
    if (!p) throw new ConvexError("PDF not found. Use list_pdfs for ids.");
    const notes = (await notesOf(ctx, p._id))
      .sort((a, b) => a.page - b.page || (a.y ?? a.rects?.[0]?.y ?? 0) - (b.y ?? b.rects?.[0]?.y ?? 0))
      .map((n) => ({ id: n.id, page: n.page, kind: n.kind === "highlight" ? "highlight" : n.audioUrl ? "voice note" : n.x !== null ? "note on a spot" : "page note", quote: n.quote, text: n.text || null, transcript: n.transcript, audioUrl: n.audioUrl, by: n.authorName, agent: n.agent, at: new Date(n.createdAt).toISOString() }));
    return { id: p._id, title: p.title, pages: p.pages ?? null, authors: p.authors ?? null, about: p.about ?? null, sourceUrl: p.sourceUrl ?? null, url: link(p._id), fileUrl: await ctx.storage.getUrl(p.storageId), notes };
  },
});

export const noteForAgent = internalMutation({
  args: { pdf: v.string(), page: v.number(), text: v.string(), quote: v.optional(v.string()), agentName: v.optional(v.string()) },
  handler: async (ctx, { pdf, page, text, quote, agentName }) => {
    const id = ctx.db.normalizeId("pdfs", idOf(pdf));
    if (!id) throw new ConvexError("PDF not found. Use list_pdfs for ids.");
    if (!text.trim()) throw new ConvexError("Write something in the note");
    const noteId = await insertNote(ctx, { pdfId: id, page, kind: "note", text, ...(quote ? { quote } : {}) }, { id: null, name: (agentName?.trim() || "Claude").slice(0, 60), agent: true });
    return { id: noteId, url: link(id) };
  },
});

export const updateForAgent = internalMutation({
  args: { pdf: v.string(), title: v.optional(v.string()), authors: v.optional(v.string()), about: v.optional(v.string()) },
  handler: async (ctx, { pdf, title, authors, about }) => {
    const id = ctx.db.normalizeId("pdfs", idOf(pdf));
    const p = id ? await ctx.db.get(id) : null;
    if (!p) throw new ConvexError("PDF not found. Use list_pdfs for ids.");
    await ctx.db.patch(p._id, { ...(title?.trim() ? { title: title.trim().slice(0, 300) } : {}), ...(authors !== undefined ? { authors: authors.slice(0, 500) } : {}), ...(about !== undefined ? { about: about.slice(0, 2000) } : {}), updatedAt: Date.now() });
    return { id: p._id, url: link(p._id) };
  },
});
