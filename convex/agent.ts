// Agent API for Native Note. Every route needs the AGENT_API_KEY bearer token.
//
// Safety model: agents can change anything except delete a script. Script text edits go straight in,
// and every edit first keeps the previous text as an archived version (Versions menu) that can be
// restored. suggest_script_edit still exists for when someone wants to approve changes first.

import { ConvexError, v, type Infer } from "convex/values";
import { httpAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { newSlug, writeEditedVersion } from "./lib";
import { blockColor, blockType, legacyStatus, sponsorship, textColor, videoStatus } from "./schema";
import { authorized } from "./agentAuth";
import { toStatus } from "./migrations";
import { insertUpdate } from "./updates";
import { insertIdea } from "./ideas";
import { reattachComments } from "./commentAnchors";
import { queueAssetSync } from "./library";

/** Agents may still send the old statuses; they're mapped to the new ones. */
const status = v.union(videoStatus, legacyStatus);
const format = v.union(v.literal("long"), v.literal("short"));
const line = v.object({
  key: v.optional(v.string()),
  type: v.optional(blockType),
  text: v.string(),
  checked: v.optional(v.boolean()),
  /** Background color of the block */
  color: v.optional(blockColor),
  /** Color of the text */
  textColor: v.optional(textColor),
});
type Line = Infer<typeof line>;

const update = v.object({
  title: v.string(),
  details: v.optional(v.string()),
  link: v.optional(v.union(v.string(), v.null())),
  source: v.optional(v.union(v.string(), v.null())),
  /** When it happened, YYYY-MM-DD or a full ISO time; defaults to now */
  date: v.optional(v.string()),
  /** Needs a response right away: pinned to the top of the Feed */
  urgent: v.optional(v.boolean()),
});
type UpdateArg = Infer<typeof update>;

function parseDate(d: string | undefined) {
  if (!d) return undefined;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : d);
  if (!Number.isFinite(t)) throw new ConvexError("date must be YYYY-MM-DD or an ISO time");
  return t;
}

async function addUpdates(ctx: MutationCtx, videoId: Id<"videos">, list: UpdateArg[], agentName: string | undefined) {
  if (list.length > 100) throw new ConvexError("At most 100 updates at once");
  const name = (agentName?.trim() || "Claude").slice(0, 60);
  for (const u of list) await insertUpdate(ctx, videoId, { ...u, happenedAt: parseDate(u.date) }, { name, id: null, agent: true });
}

const MAX_LINES = 2000;
const MAX_TEXT = 20000;
const shareUrl = (slug: string) => `${process.env.SITE_URL ?? ""}/s/${slug}`;

async function resolveVideo(ctx: QueryCtx, script: string) {
  const id = ctx.db.normalizeId("videos", script);
  const video = id
    ? await ctx.db.get(id)
    : await ctx.db
        .query("videos")
        .withIndex("by_slug", (q) => q.eq("shareSlug", script.split("/").pop() ?? script))
        .unique();
  if (!video) throw new ConvexError("Script not found. Pass its id or share link.");
  return video;
}

async function docOf(ctx: QueryCtx, videoId: Id<"videos">, kind: "main" | "instructions") {
  return ctx.db
    .query("documents")
    .withIndex("by_video", (q) => q.eq("videoId", videoId).eq("kind", kind))
    .first();
}

async function linesOf(ctx: QueryCtx, documentId: Id<"documents"> | undefined) {
  if (!documentId) return [];
  const blocks = await ctx.db
    .query("blocks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  return blocks.map((b) => ({
    key: b.key,
    type: b.type,
    text: b.content,
    ...(b.type === "todo" ? { checked: b.checked } : {}),
    ...(b.color ? { color: b.color } : {}),
    ...(b.textColor ? { textColor: b.textColor } : {}),
  }));
}

function checkLines(lines: Line[]) {
  if (lines.length > MAX_LINES) throw new ConvexError(`At most ${MAX_LINES} lines`);
  for (const l of lines) if (l.text.length > MAX_TEXT) throw new ConvexError(`Lines can be at most ${MAX_TEXT} characters`);
}

// ---------- Reads ----------

export const listScripts = internalQuery({
  args: { query: v.optional(v.string()) },
  handler: async (ctx, { query }) => {
    const q = query?.trim().toLowerCase();
    const videos = await ctx.db.query("videos").withIndex("by_updated").order("desc").collect();
    const out = [];
    for (const vid of videos) {
      if (q && !vid.title.toLowerCase().includes(q)) continue;
      const edited = await ctx.db
        .query("documents")
        .withIndex("by_video", (x) => x.eq("videoId", vid._id).eq("kind", "edited"))
        .collect();
      out.push({
        id: vid._id,
        title: vid.title,
        status: vid.status,
        format: vid.format,
        liveDate: vid.liveDate,
        sponsored: vid.sponsored ?? "none",
        updatedAt: new Date(vid.updatedAt).toISOString(),
        editedVersionsWaiting: edited.length,
        shareUrl: shareUrl(vid.shareSlug),
      });
    }
    return out;
  },
});

export const script = internalQuery({
  args: { script: v.string() },
  handler: async (ctx, { script }) => {
    const video = await resolveVideo(ctx, script);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", video._id))
      .collect();
    const mainLines = await linesOf(ctx, (await docOf(ctx, video._id, "main"))?._id);
    const insLines = await linesOf(ctx, (await docOf(ctx, video._id, "instructions"))?._id);
    const lineKeys = new Set([...mainLines, ...insLines].map((l) => l.key));
    return {
      id: video._id,
      title: video.title,
      status: video.status,
      format: video.format,
      liveDate: video.liveDate,
      sponsored: video.sponsored ?? "none",
      shareUrl: shareUrl(video.shareSlug),
      /** Everything a video editor needs, including direct download links for all attached files (no auth) */
      assetsUrl: `${shareUrl(video.shareSlug)}/agent`,
      brief: video.brief ?? "",
      briefLinks: (video.briefLinks ?? []).map(({ label, url }) => ({ label, url })),
      captions: (video.captions ?? []).map(({ id: _id, fields, ...c }) => ({ ...c, fields: fields.map((f) => ({ label: f.label, value: f.value })) })),
      instructions: insLines,
      lines: mainLines,
      updates: (
        await ctx.db
          .query("updates")
          .withIndex("by_video", (q) => q.eq("videoId", video._id))
          .order("desc")
          .collect()
      ).map((u) => ({ title: u.title, date: new Date(u.happenedAt).toISOString(), source: u.source, link: u.link, details: u.details, by: u.authorName })),
      comments: comments.map((c) => ({
        id: c._id,
        lineKey: c.blockKey,
        onRemovedLine: !!c.blockKey && !lineKeys.has(c.blockKey),
        quote: c.quote,
        text: c.text,
        author: c.authorName,
        agent: c.agent,
        files: c.attachments.map((a) => ({ name: a.name, kind: a.kind, url: a.url, mime: a.mime, size: a.size })),
        createdAt: new Date(c.createdAt).toISOString(),
      })),
    };
  },
});

// ---------- Writes (all additive or reviewable) ----------

export const createScript = internalMutation({
  args: {
    title: v.string(),
    format: v.optional(format),
    status: v.optional(status),
    liveDate: v.optional(v.union(v.string(), v.null())),
    sponsored: v.optional(sponsorship),
    lines: v.optional(v.array(line)),
    instructions: v.optional(v.array(v.string())),
    brief: v.optional(v.string()),
    updates: v.optional(v.array(update)),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (a.brief && a.brief.length > 50000) throw new ConvexError("The brief can be at most 50,000 characters");
    checkLines(a.lines ?? []);
    const now = Date.now();
    const slug = newSlug();
    const videoId = await ctx.db.insert("videos", {
      title: a.title.slice(0, 300),
      liveDate: a.liveDate ?? null,
      status: toStatus(a.status ?? "inProduction"),
      format: a.format ?? "long",
      sponsored: a.sponsored ?? "none",
      ...(a.brief ? { brief: a.brief } : {}),
      shareSlug: slug,
      editPasscode: null,
      createdBy: null,
      updatedAt: now,
    });
    const mainId = await ctx.db.insert("documents", { videoId, kind: "main", editorName: null, guestToken: null, updatedAt: now });
    const insId = await ctx.db.insert("documents", { videoId, kind: "instructions", editorName: null, guestToken: null, updatedAt: now });
    const lines = a.lines?.length ? a.lines : [{ text: "" }];
    for (const [i, l] of lines.entries()) {
      await ctx.db.insert("blocks", {
        documentId: mainId,
        videoId,
        key: crypto.randomUUID(),
        position: i,
        type: l.type ?? "p",
        content: l.text,
        checked: !!l.checked,
        color: null,
        sourceBlockId: null,
      });
    }
    for (const [i, text] of (a.instructions ?? []).slice(0, 200).entries()) {
      await ctx.db.insert("blocks", {
        documentId: insId,
        videoId,
        key: crypto.randomUUID(),
        position: i,
        type: "todo",
        content: text.slice(0, MAX_TEXT),
        checked: false,
        color: null,
        sourceBlockId: null,
      });
    }
    await addUpdates(ctx, videoId, a.updates ?? [], a.agentName);
    return { id: videoId, shareUrl: shareUrl(slug) };
  },
});

export const updateDetails = internalMutation({
  args: {
    script: v.string(),
    title: v.optional(v.string()),
    liveDate: v.optional(v.union(v.string(), v.null())),
    format: v.optional(format),
    status: v.optional(status),
    sponsored: v.optional(sponsorship),
  },
  handler: async (ctx, { script, ...patch }) => {
    const video = await resolveVideo(ctx, script);
    if (patch.liveDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.liveDate)) throw new ConvexError("liveDate must be YYYY-MM-DD");
    if (patch.title !== undefined) patch.title = patch.title.slice(0, 300);
    const { status: st, ...rest } = patch;
    await ctx.db.patch(video._id, { ...rest, ...(st ? { status: toStatus(st) } : {}), updatedAt: Date.now() });
    if (rest.title !== undefined) await queueAssetSync(ctx, video._id);
    return { id: video._id };
  },
});

/**
 * Proposes new text for the whole script. Lines that keep an existing `key` are treated as edits of
 * that line; lines without a key are new; existing lines left out are shown as removed. Nothing
 * changes until a person clicks "Use this version". One pending suggestion per agent name.
 */
export const suggestEdit = internalMutation({
  args: { script: v.string(), agentName: v.optional(v.string()), lines: v.array(line) },
  handler: async (ctx, { script, agentName, lines }) => {
    checkLines(lines);
    const video = await resolveVideo(ctx, script);
    const main = await docOf(ctx, video._id, "main");
    const existing = new Map((await linesOf(ctx, main?._id)).map((l) => [l.key, l]));
    const used = new Set<string>();
    const name = (agentName?.trim() || "Claude").slice(0, 60);
    const blocks = lines.map((l) => {
      const src = l.key && existing.has(l.key) && !used.has(l.key) ? l.key : null;
      if (src) used.add(src);
      const prev = src ? existing.get(src) : undefined;
      return {
        key: crypto.randomUUID(),
        type: l.type ?? prev?.type ?? "p",
        content: l.text,
        checked: l.checked ?? !!prev?.checked,
        color: null as Doc<"blocks">["color"],
        sourceBlockId: src,
      };
    });
    // Keep line colors from the original where the line is kept
    if (main) {
      const colors = new Map(
        (
          await ctx.db
            .query("blocks")
            .withIndex("by_document", (q) => q.eq("documentId", main._id))
            .collect()
        ).map((b) => [b.key, b.color]),
      );
      for (const b of blocks) if (b.sourceBlockId) b.color = colors.get(b.sourceBlockId) ?? null;
    }
    const token = `agent:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${video._id}`.padEnd(32, "-");
    const documentId = await writeEditedVersion(ctx, video._id, token, `${name} (agent)`, blocks);
    return { editedVersionId: documentId, note: "Saved as an Edited version. A person must accept it before the script changes." };
  },
});

export const addInstructions = internalMutation({
  args: { script: v.string(), items: v.array(v.string()) },
  handler: async (ctx, { script, items }) => {
    if (items.length > 200) throw new ConvexError("At most 200 instructions at once");
    const video = await resolveVideo(ctx, script);
    const now = Date.now();
    let ins = await docOf(ctx, video._id, "instructions");
    if (!ins) {
      const id = await ctx.db.insert("documents", { videoId: video._id, kind: "instructions", editorName: null, guestToken: null, updatedAt: now });
      ins = (await ctx.db.get(id))!;
    }
    const current = await ctx.db
      .query("blocks")
      .withIndex("by_document", (q) => q.eq("documentId", ins._id))
      .collect();
    // Replace a lone empty placeholder to-do instead of appending after it
    for (const b of current) if (!b.content.trim() && current.length === 1) await ctx.db.delete(b._id);
    let position = current.reduce((m, b) => Math.max(m, b.position), -1) + 1;
    for (const text of items) {
      await ctx.db.insert("blocks", {
        documentId: ins._id,
        videoId: video._id,
        key: crypto.randomUUID(),
        position: position++,
        type: "todo",
        content: text.slice(0, MAX_TEXT),
        checked: false,
        color: null,
        sourceBlockId: null,
      });
    }
    await ctx.db.patch(video._id, { updatedAt: now });
    return { added: items.length };
  },
});

/** Edit one existing editor instruction (its text, or check it off). Instructions can't be removed. */
export const updateInstruction = internalMutation({
  args: { script: v.string(), key: v.string(), text: v.optional(v.string()), checked: v.optional(v.boolean()) },
  handler: async (ctx, { script, key, text, checked }) => {
    const video = await resolveVideo(ctx, script);
    const ins = await docOf(ctx, video._id, "instructions");
    const block = ins
      ? await ctx.db
          .query("blocks")
          .withIndex("by_document_key", (q) => q.eq("documentId", ins._id).eq("key", key))
          .unique()
      : null;
    if (!block) throw new ConvexError("Instruction not found. Use a key from the script's instructions.");
    await ctx.db.patch(block._id, {
      ...(text !== undefined ? { content: text.slice(0, MAX_TEXT) } : {}),
      ...(checked !== undefined ? { checked } : {}),
    });
    await ctx.db.patch(video._id, { updatedAt: Date.now() });
    return { key };
  },
});

/**
 * Add or update one platform's caption, matched by platform name (case-insensitive). Only the parts
 * you pass change. Custom fields are matched by label: new labels are added, existing ones updated.
 * Platforms and fields can't be removed through the API.
 */
export const setCaption = internalMutation({
  args: {
    script: v.string(),
    platform: v.string(),
    caption: v.optional(v.string()),
    linkInBio: v.optional(v.string()),
    posted: v.optional(v.boolean()),
    fields: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
  },
  handler: async (ctx, { script, platform, caption, linkInBio, posted, fields }) => {
    const video = await resolveVideo(ctx, script);
    const typed = platform.trim().slice(0, 60);
    const known = ["Instagram", "TikTok", "YouTube", "YouTube Shorts", "X", "LinkedIn", "Facebook", "Threads"];
    const name = known.find((k) => k.toLowerCase() === typed.toLowerCase()) ?? typed;
    if (!name) throw new ConvexError("Pass a platform name, e.g. Instagram");
    if (caption && caption.length > MAX_TEXT) throw new ConvexError(`Captions can be at most ${MAX_TEXT} characters`);
    const list = [...(video.captions ?? [])];
    let i = list.findIndex((c) => c.platform.trim().toLowerCase() === name.toLowerCase());
    if (i < 0) {
      if (list.length >= 30) throw new ConvexError("At most 30 platforms");
      list.push({ id: crypto.randomUUID(), platform: name, caption: "", linkInBio: "", posted: false, fields: [] });
      i = list.length - 1;
    }
    const cur = list[i];
    const merged = [...cur.fields];
    for (const f of fields ?? []) {
      const j = merged.findIndex((x) => x.label.trim().toLowerCase() === f.label.trim().toLowerCase());
      if (j >= 0) merged[j] = { ...merged[j], value: f.value.slice(0, MAX_TEXT) };
      else merged.push({ id: crypto.randomUUID(), label: f.label.trim().slice(0, 100), value: f.value.slice(0, MAX_TEXT) });
    }
    if (merged.length > 30) throw new ConvexError("At most 30 custom fields per platform");
    list[i] = {
      ...cur,
      caption: caption ?? cur.caption,
      linkInBio: linkInBio ?? cur.linkInBio,
      posted: posted ?? cur.posted,
      fields: merged,
    };
    await ctx.db.patch(video._id, { captions: list, updatedAt: Date.now() });
    return { platform: list[i].platform, caption: list[i].caption, linkInBio: list[i].linkInBio, posted: list[i].posted, fields: merged.map((f) => ({ label: f.label, value: f.value })) };
  },
});

/** Add links to the brief (docs, contracts, email threads). A link whose URL is already there gets the new label. */
export const addBriefLinks = internalMutation({
  args: { script: v.string(), links: v.array(v.object({ label: v.string(), url: v.string() })) },
  handler: async (ctx, { script, links }) => {
    const video = await resolveVideo(ctx, script);
    const list = [...(video.briefLinks ?? [])];
    for (const l of links) {
      const url = l.url.trim();
      if (!/^https?:\/\//i.test(url)) throw new ConvexError(`Links must start with http:// or https:// (${url})`);
      const label = l.label.trim().slice(0, 120) || url;
      const i = list.findIndex((x) => x.url === url);
      if (i >= 0) list[i] = { ...list[i], label };
      else list.push({ id: crypto.randomUUID(), label, url: url.slice(0, 2000) });
    }
    if (list.length > 100) throw new ConvexError("At most 100 brief links");
    await ctx.db.patch(video._id, { briefLinks: list, updatedAt: Date.now() });
    return { links: list.map(({ label, url }) => ({ label, url })) };
  },
});

/** Write the brief. mode "append" (default) adds to the end; "replace" swaps the whole brief. */
export const setBrief = internalMutation({
  args: { script: v.string(), text: v.string(), mode: v.optional(v.union(v.literal("append"), v.literal("replace"))) },
  handler: async (ctx, { script, text, mode }) => {
    const video = await resolveVideo(ctx, script);
    const cur = video.brief ?? "";
    const brief = mode === "replace" || !cur.trim() ? text : `${cur.replace(/\s+$/, "")}\n\n${text}`;
    if (brief.length > 50000) throw new ConvexError("The brief can be at most 50,000 characters");
    await ctx.db.patch(video._id, { brief, updatedAt: Date.now() });
    return { length: brief.length };
  },
});

/** Log what happened on a video (Updates tab): new emails, calls, approvals, dates moving. Can't be removed by agents. */
export const addUpdate = internalMutation({
  args: { script: v.string(), agentName: v.optional(v.string()), ...update.fields },
  handler: async (ctx, { script, agentName, ...u }) => {
    const video = await resolveVideo(ctx, script);
    await addUpdates(ctx, video._id, [u], agentName);
    return { added: 1 };
  },
});

// ---------- Direct edits (every change keeps the previous version) ----------

type NewLine = {
  key?: string;
  type?: Doc<"blocks">["type"];
  text: string;
  checked?: boolean;
  color?: Doc<"blocks">["color"];
  textColor?: Doc<"blocks">["textColor"];
};

/**
 * Makes `lines` the script's text. The current text is kept as an earlier version (the Versions menu,
 * "Replaced … by <agent>"), so any change can be undone with Restore. Lines that keep their key stay the
 * same line (their comments stay on them); lines without a key are new; lines left out are deleted.
 */
async function replaceScript(ctx: MutationCtx, video: Doc<"videos">, lines: NewLine[], agentName: string | undefined) {
  checkLines(lines);
  const name = (agentName?.trim() || "Claude").slice(0, 60);
  const now = Date.now();
  const main = await docOf(ctx, video._id, "main");
  const old = main
    ? await ctx.db
        .query("blocks")
        .withIndex("by_document", (q) => q.eq("documentId", main._id))
        .collect()
    : [];
  const byKey = new Map(old.map((b) => [b.key, b]));
  const used = new Set<string>();
  const documentId = await ctx.db.insert("documents", { videoId: video._id, kind: "main", editorName: name, guestToken: null, updatedAt: now });
  const out = [];
  for (const [position, l] of lines.entries()) {
    const prev = l.key && byKey.has(l.key) && !used.has(l.key) ? byKey.get(l.key)! : undefined;
    // A key that isn't in the current text is honoured too (restoring an earlier version brings its lines
    // back with their old keys, so their comments come back with them)
    const reuse = !prev && l.key && !used.has(l.key) && /^[\w-]{8,64}$/.test(l.key) ? l.key : undefined;
    const key = prev ? prev.key : (reuse ?? crypto.randomUUID());
    used.add(key);
    const type = l.type ?? prev?.type ?? "p";
    await ctx.db.insert("blocks", {
      documentId,
      videoId: video._id,
      key,
      position,
      type,
      content: l.text.slice(0, MAX_TEXT),
      checked: l.checked ?? prev?.checked ?? false,
      color: l.color !== undefined ? l.color : (prev?.color ?? null),
      textColor: l.textColor !== undefined ? l.textColor : (prev?.textColor ?? null),
      sourceBlockId: null,
      ...(prev?.attachments ? { attachments: prev.attachments } : {}),
    });
    out.push({ key, type, text: l.text });
  }
  // The old text becomes an earlier version; its label says who replaced it
  if (main) await ctx.db.patch(main._id, { kind: "archived", editorName: name, updatedAt: now });
  await ctx.db.patch(video._id, { updatedAt: now });
  // Comments are never lost: they stay on kept lines, follow rewritten ones, and come back on restore
  const ins = await docOf(ctx, video._id, "instructions");
  const insKeys = new Set(ins ? (await linesOf(ctx, ins._id)).map((l) => l.key) : []);
  const comments = await reattachComments(
    ctx,
    video._id,
    old.map((b) => ({ key: b.key, content: b.content })),
    out.map((l) => ({ key: l.key, content: l.text })),
    insKeys,
  );
  return {
    lines: out,
    ...comments,
    note:
      "Saved. The previous text (and where its comments were) is kept under Versions and can be restored." +
      (comments.commentsOnRemovedLines ? " Some comments were on lines you removed; they now show on the whole script. Use move_comment to put them on the right line." : ""),
  };
}

async function currentLines(ctx: QueryCtx, video: Doc<"videos">): Promise<NewLine[]> {
  return (await linesOf(ctx, (await docOf(ctx, video._id, "main"))?._id)).map((l) => ({ key: l.key, type: l.type, text: l.text }));
}

/** Replace the whole script text (keep keys for lines you keep). Previous version is saved. */
export const editScript = internalMutation({
  args: { script: v.string(), agentName: v.optional(v.string()), lines: v.array(line) },
  handler: async (ctx, { script, agentName, lines }) => replaceScript(ctx, await resolveVideo(ctx, script), lines, agentName),
});

const lineOp = v.union(
  v.object({
    op: v.literal("replace"),
    key: v.string(),
    text: v.optional(v.string()),
    type: v.optional(blockType),
    checked: v.optional(v.boolean()),
    color: v.optional(blockColor),
    textColor: v.optional(textColor),
  }),
  v.object({ op: v.literal("insert"), afterKey: v.optional(v.union(v.string(), v.null())), lines: v.array(line) }),
  v.object({ op: v.literal("delete"), key: v.string() }),
  v.object({ op: v.literal("move"), key: v.string(), afterKey: v.optional(v.union(v.string(), v.null())) }),
);

/**
 * Small edits by line key: replace a line's text/type, insert lines after a line (afterKey null or missing =
 * at the top), delete a line, move a line. All ops apply in order as one change; the previous version is saved.
 */
export const editLines = internalMutation({
  args: { script: v.string(), agentName: v.optional(v.string()), ops: v.array(lineOp) },
  handler: async (ctx, { script, agentName, ops }) => {
    if (ops.length > 500) throw new ConvexError("At most 500 operations at once");
    const video = await resolveVideo(ctx, script);
    const list = await currentLines(ctx, video);
    const indexOf = (key: string) => {
      const i = list.findIndex((l) => l.key === key);
      if (i < 0) throw new ConvexError(`No line with key ${key}. Read the script again for current keys.`);
      return i;
    };
    const after = (key: string | null | undefined) => (key ? indexOf(key) + 1 : 0);
    for (const o of ops) {
      if (o.op === "replace") {
        const i = indexOf(o.key);
        list[i] = {
          ...list[i],
          ...(o.text !== undefined ? { text: o.text } : {}),
          ...(o.type ? { type: o.type } : {}),
          ...(o.checked !== undefined ? { checked: o.checked } : {}),
          ...(o.color !== undefined ? { color: o.color } : {}),
          ...(o.textColor !== undefined ? { textColor: o.textColor } : {}),
        };
      } else if (o.op === "insert") {
        list.splice(after(o.afterKey), 0, ...o.lines.map((l) => ({ type: l.type, text: l.text, checked: l.checked, color: l.color, textColor: l.textColor })));
      } else if (o.op === "delete") {
        list.splice(indexOf(o.key), 1);
      } else {
        const [moved] = list.splice(indexOf(o.key), 1);
        list.splice(after(o.afterKey), 0, moved);
      }
    }
    return replaceScript(ctx, video, list, agentName);
  },
});

/** Earlier versions of the script, newest first, to restore one. */
export const listVersions = internalQuery({
  args: { script: v.string() },
  handler: async (ctx, { script }) => {
    const video = await resolveVideo(ctx, script);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_video", (q) => q.eq("videoId", video._id).eq("kind", "archived"))
      .collect();
    return docs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((d) => ({ versionId: d._id, replacedAt: new Date(d.updatedAt).toISOString(), replacedBy: d.editorName }));
  },
});

/** Bring back an earlier version's text (the current text is saved as a version first). */
export const restoreVersion = internalMutation({
  args: { script: v.string(), versionId: v.string(), agentName: v.optional(v.string()) },
  handler: async (ctx, { script, versionId, agentName }) => {
    const video = await resolveVideo(ctx, script);
    const id = ctx.db.normalizeId("documents", versionId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.videoId !== video._id || doc.kind !== "archived") throw new ConvexError("Version not found. Use list_versions.");
    // Exactly as it was, colors included
    const lines = (await linesOf(ctx, doc._id)).map((l) => ({
      key: l.key,
      type: l.type,
      text: l.text,
      checked: l.checked,
      color: l.color ?? null,
      textColor: l.textColor ?? null,
    }));
    return replaceScript(ctx, video, lines, agentName);
  },
});

/** Remove an editor instruction. */
export const deleteInstruction = internalMutation({
  args: { script: v.string(), key: v.string() },
  handler: async (ctx, { script, key }) => {
    const video = await resolveVideo(ctx, script);
    const ins = await docOf(ctx, video._id, "instructions");
    const block = ins
      ? await ctx.db
          .query("blocks")
          .withIndex("by_document_key", (q) => q.eq("documentId", ins._id).eq("key", key))
          .unique()
      : null;
    if (!block) throw new ConvexError("Instruction not found. Use a key from the script's instructions.");
    await ctx.db.delete(block._id);
    await ctx.db.patch(video._id, { updatedAt: Date.now() });
    return { deleted: key };
  },
});

/** Remove one platform's caption, or brief links by URL. */
export const removeCaption = internalMutation({
  args: { script: v.string(), platform: v.string() },
  handler: async (ctx, { script, platform }) => {
    const video = await resolveVideo(ctx, script);
    const list = (video.captions ?? []).filter((c) => c.platform.trim().toLowerCase() !== platform.trim().toLowerCase());
    if (list.length === (video.captions ?? []).length) throw new ConvexError(`No ${platform} caption on this script`);
    await ctx.db.patch(video._id, { captions: list, updatedAt: Date.now() });
    return { removed: platform };
  },
});

export const removeBriefLinks = internalMutation({
  args: { script: v.string(), urls: v.array(v.string()) },
  handler: async (ctx, { script, urls }) => {
    const video = await resolveVideo(ctx, script);
    const drop = new Set(urls.map((u) => u.trim()));
    const list = (video.briefLinks ?? []).filter((l) => !drop.has(l.url));
    await ctx.db.patch(video._id, { briefLinks: list, updatedAt: Date.now() });
    return { removed: (video.briefLinks ?? []).length - list.length };
  },
});

// ---------- Comments ----------

async function commentOf(ctx: QueryCtx, video: Doc<"videos">, commentId: string) {
  const id = ctx.db.normalizeId("comments", commentId);
  const c = id ? await ctx.db.get(id) : null;
  if (!c || c.videoId !== video._id) throw new ConvexError("Comment not found on this script. Use the id from get_script.");
  return c;
}

/** Put a comment on another line (by key or by part of its text), or on the whole script (neither given). */
export const moveComment = internalMutation({
  args: { script: v.string(), commentId: v.string(), toKey: v.optional(v.string()), lineContains: v.optional(v.string()) },
  handler: async (ctx, { script, commentId, toKey, lineContains }) => {
    const video = await resolveVideo(ctx, script);
    const c = await commentOf(ctx, video, commentId);
    const lines = [
      ...(await linesOf(ctx, (await docOf(ctx, video._id, "main"))?._id)),
      ...(await linesOf(ctx, (await docOf(ctx, video._id, "instructions"))?._id)),
    ];
    let key: string | null = null;
    if (toKey) {
      if (!lines.some((l) => l.key === toKey)) throw new ConvexError(`No line with key ${toKey}`);
      key = toKey;
    } else if (lineContains) {
      const hit = lines.find((l) => l.text.toLowerCase().includes(lineContains.toLowerCase()));
      if (!hit) throw new ConvexError(`No line contains "${lineContains}"`);
      key = hit.key;
    }
    const history = c.keyHistory ?? [];
    await ctx.db.patch(c._id, {
      blockKey: key,
      quote: key ? (lines.find((l) => l.key === key)?.text ?? c.quote) : c.quote,
      keyHistory: c.blockKey && c.blockKey !== key ? [...history.filter((k) => k !== c.blockKey), c.blockKey].slice(-20) : history,
      updatedAt: Date.now(),
    });
    await queueAssetSync(ctx, video._id);
    return { id: c._id, lineKey: key };
  },
});

/** Change the text of a comment an agent wrote. People's comments can be moved but not rewritten. */
export const updateComment = internalMutation({
  args: { script: v.string(), commentId: v.string(), text: v.string() },
  handler: async (ctx, { script, commentId, text }) => {
    const c = await commentOf(ctx, await resolveVideo(ctx, script), commentId);
    if (!c.agent) throw new ConvexError("That comment was written by a person. Leave a new comment (or move theirs) instead of rewriting it.");
    await ctx.db.patch(c._id, { text: text.slice(0, 10000), updatedAt: Date.now() });
    return { id: c._id };
  },
});

/** Delete a comment an agent wrote. */
export const deleteComment = internalMutation({
  args: { script: v.string(), commentId: v.string() },
  handler: async (ctx, { script, commentId }) => {
    const c = await commentOf(ctx, await resolveVideo(ctx, script), commentId);
    if (!c.agent) throw new ConvexError("That comment was written by a person; only its author can delete it.");
    await ctx.db.delete(c._id);
    await queueAssetSync(ctx, c.videoId);
    return { deleted: c._id };
  },
});

// ---------- Mymind (ideas) ----------

/** Save ideas to Mymind: one or many (e.g. an import of bookmarks). Links already saved aren't duplicated. */
export const addIdeas = internalMutation({
  args: {
    ideas: v.array(v.object({ url: v.optional(v.string()), note: v.optional(v.string()), date: v.optional(v.string()) })),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, { ideas, agentName }) => {
    if (ideas.length > 200) throw new ConvexError("At most 200 ideas per call; send the rest in another call");
    const name = (agentName?.trim() || "Claude").slice(0, 60);
    let added = 0;
    let duplicates = 0;
    for (const i of ideas) {
      const r = await insertIdea(ctx, { url: i.url, note: i.note }, { name, agent: true }, parseDate(i.date));
      if (r.duplicate) duplicates++;
      else added++;
    }
    return { added, alreadySaved: duplicates };
  },
});

export const listIdeas = internalQuery({
  args: { query: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { query, limit }) => {
    const n = Math.min(Math.max(limit ?? 50, 1), 500);
    const q = query?.trim().toLowerCase();
    const rows = q
      ? await ctx.db
          .query("ideas")
          .withSearchIndex("search", (s) => s.search("searchText", q))
          .take(n)
      : await ctx.db.query("ideas").withIndex("by_created").order("desc").take(n);
    return rows.map((i) => ({ kind: i.kind, url: i.url ?? i.fileUrl, note: i.note, added: new Date(i.createdAt).toISOString(), by: i.authorName }));
  },
});

// ---------- HTTP ----------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });

const errorOf = (e: unknown) => (e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : "Failed");

/** Wraps a handler with the API key check, JSON parsing and friendly errors. */
function route(handler: (ctx: Parameters<Parameters<typeof httpAction>[0]>[0], body: Record<string, unknown>, url: URL) => Promise<unknown>) {
  return httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "Unauthorized. Send Authorization: Bearer <NATIVE_NOTE_API_KEY>." }, 401);
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      const parsed = await req.json().catch(() => null);
      if (!parsed || typeof parsed !== "object") return json({ error: "Send a JSON body" }, 400);
      body = parsed as Record<string, unknown>;
    }
    try {
      return json(await handler(ctx, body, new URL(req.url)));
    } catch (e) {
      return json({ error: errorOf(e) }, 400);
    }
  });
}

// Body values arrive as unknown JSON; Convex validators check them again inside each function.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const httpListScripts = route((ctx, _b, url) =>
  ctx.runQuery(internal.agent.listScripts, { query: url.searchParams.get("q") ?? undefined }),
);
export const httpGetScript = route((ctx, _b, url) => {
  const script = url.searchParams.get("script");
  if (!script) throw new ConvexError("Pass ?script=<id or share link>");
  return ctx.runQuery(internal.agent.script, { script });
});
export const httpCreateScript = route((ctx, b) => ctx.runMutation(internal.agent.createScript, b as any));
export const httpUpdateDetails = route((ctx, b) => ctx.runMutation(internal.agent.updateDetails, b as any));
export const httpSuggestEdit = route((ctx, b) => ctx.runMutation(internal.agent.suggestEdit, b as any));
export const httpAddInstructions = route((ctx, b) => ctx.runMutation(internal.agent.addInstructions, b as any));
export const httpUpdateInstruction = route((ctx, b) => ctx.runMutation(internal.agent.updateInstruction, b as any));
export const httpSetCaption = route((ctx, b) => ctx.runMutation(internal.agent.setCaption, b as any));
export const httpAddBriefLinks = route((ctx, b) => ctx.runMutation(internal.agent.addBriefLinks, b as any));
export const httpSetBrief = route((ctx, b) => ctx.runMutation(internal.agent.setBrief, b as any));
export const httpAddUpdate = route((ctx, b) => ctx.runMutation(internal.agent.addUpdate, b as any));
export const httpAddIdeas = route((ctx, b) => ctx.runMutation(internal.agent.addIdeas, b as any));
export const httpListIdeas = route((ctx, _b, url) =>
  ctx.runQuery(internal.agent.listIdeas, { query: url.searchParams.get("q") ?? undefined, limit: Number(url.searchParams.get("limit")) || undefined }),
);
export const httpEditScript = route((ctx, b) => ctx.runMutation(internal.agent.editScript, b as any));
export const httpEditLines = route((ctx, b) => ctx.runMutation(internal.agent.editLines, b as any));
export const httpListVersions = route((ctx, _b, url) => {
  const script = url.searchParams.get("script");
  if (!script) throw new ConvexError("Pass ?script=<id or share link>");
  return ctx.runQuery(internal.agent.listVersions, { script });
});
export const httpRestoreVersion = route((ctx, b) => ctx.runMutation(internal.agent.restoreVersion, b as any));
export const httpDeleteInstruction = route((ctx, b) => ctx.runMutation(internal.agent.deleteInstruction, b as any));
export const httpRemoveCaption = route((ctx, b) => ctx.runMutation(internal.agent.removeCaption, b as any));
export const httpRemoveBriefLinks = route((ctx, b) => ctx.runMutation(internal.agent.removeBriefLinks, b as any));
export const httpMoveComment = route((ctx, b) => ctx.runMutation(internal.agent.moveComment, b as any));
export const httpUpdateComment = route((ctx, b) => ctx.runMutation(internal.agent.updateComment, b as any));
export const httpDeleteComment = route((ctx, b) => ctx.runMutation(internal.agent.deleteComment, b as any));
export const httpComment = route(async (ctx, b) => ({
  id: await ctx.runMutation(internal.comments.addAgent, b as any),
}));
/* eslint-enable @typescript-eslint/no-explicit-any */
