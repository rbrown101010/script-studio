import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Not signed in");
  return userId;
}

export function newSlug() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function docBlocks(ctx: QueryCtx, documentId: Id<"documents">) {
  const rows = await ctx.db
    .query("blocks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  return rows.map((b) => ({
    id: b.key,
    type: b.type,
    content: b.content,
    checked: b.checked,
    color: b.color,
    textColor: b.textColor ?? null,
    source_block_id: b.sourceBlockId,
    ...(b.images ? { images: b.images } : {}),
  }));
}

/** A block's comments, turning legacy direct attachments into one empty comment each. */
export function commentsOf(b: Pick<Doc<"blocks">, "attachments" | "comments" | "_creationTime">) {
  const legacy = (b.attachments ?? []).map((a) => ({
    id: `legacy-${a.id}`,
    text: "",
    author: null,
    createdAt: b._creationTime,
    attachments: [a],
  }));
  return [...legacy, ...(b.comments ?? [])];
}

export function filesOf(b: Pick<Doc<"blocks">, "attachments" | "comments">): Id<"_storage">[] {
  const out: Id<"_storage">[] = [];
  for (const a of b.attachments ?? []) if (a.storageId) out.push(a.storageId);
  for (const c of b.comments ?? []) for (const a of c.attachments) if (a.storageId) out.push(a.storageId);
  return out;
}

/** Deletes stored files that no block or comment of this video uses anymore. */
export async function releaseFiles(ctx: MutationCtx, videoId: Id<"videos">, candidates: Iterable<Id<"_storage">>) {
  const ids = new Set(candidates);
  if (!ids.size) return;
  const blocks = await ctx.db
    .query("blocks")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();
  for (const b of blocks) for (const f of filesOf(b)) ids.delete(f);
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();
  for (const c of comments) for (const a of c.attachments) if (a.storageId) ids.delete(a.storageId);
  for (const id of ids) {
    try {
      await ctx.storage.delete(id);
    } catch {
      // already gone
    }
  }
}

export async function deleteDocument(ctx: MutationCtx, documentId: Id<"documents">) {
  const doc = await ctx.db.get(documentId);
  if (!doc) return;
  const blocks = await ctx.db
    .query("blocks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  const files: Id<"_storage">[] = [];
  for (const b of blocks) {
    files.push(...filesOf(b));
    await ctx.db.delete(b._id);
  }
  await ctx.db.delete(documentId);
  await releaseFiles(ctx, doc.videoId, files);
}

type EditedBlock = {
  key: string;
  type: Doc<"blocks">["type"];
  content: string;
  checked: boolean;
  color: Doc<"blocks">["color"];
  textColor?: Doc<"blocks">["textColor"];
  images?: Doc<"blocks">["images"];
  sourceBlockId: string | null;
};

/**
 * Saves someone's whole suggested copy of a script as an "Edited version" (one per token), so the
 * owner can review it in red and choose what to keep. Never touches the main script.
 */
export async function writeEditedVersion(
  ctx: MutationCtx,
  videoId: Id<"videos">,
  token: string,
  editorName: string,
  blocks: EditedBlock[],
) {
  if (blocks.length > 5000) throw new ConvexError("Too many lines");
  const now = Date.now();
  let doc = await ctx.db
    .query("documents")
    .withIndex("by_token", (q) => q.eq("guestToken", token))
    .first();
  if (doc && (doc.videoId !== videoId || doc.kind !== "edited")) doc = null;

  let documentId: Id<"documents">;
  const dropped: Id<"_storage">[] = [];
  if (doc) {
    documentId = doc._id;
    await ctx.db.patch(documentId, { editorName, updatedAt: now });
    const old = await ctx.db
      .query("blocks")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();
    for (const b of old) {
      dropped.push(...filesOf(b));
      await ctx.db.delete(b._id);
    }
  } else {
    documentId = await ctx.db.insert("documents", {
      videoId,
      kind: "edited",
      editorName,
      guestToken: token,
      updatedAt: now,
    });
  }
  let position = 0;
  for (const b of blocks) {
    await ctx.db.insert("blocks", {
      documentId,
      videoId,
      key: b.key.slice(0, 64),
      position: position++,
      type: b.type,
      content: b.content.slice(0, 20000),
      checked: b.checked,
      color: b.color,
      ...(b.textColor ? { textColor: b.textColor } : {}),
      ...(b.images ? { images: b.images } : {}),
      sourceBlockId: b.sourceBlockId,
    });
  }
  await releaseFiles(ctx, videoId, dropped);
  return documentId;
}
