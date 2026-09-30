// Files for agents: put images, videos, PDFs or any file into comments without a browser.
//
// Each attachment is ONE of:
//   { url }              A link (image/video URLs show as media). Nothing is copied.
//   { base64, name }     The bytes inline (raw base64 or a data: URL). Stored in Native Note. Small files.
//   { storageId }        A file uploaded to Native Note: get_upload_url, then POST the raw file there. Any size.

import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_INLINE = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 20;

/** What agents send. */
export type AttachmentInput = { url?: string; base64?: string; storageId?: string; name?: string; mime?: string };

/** After base64 is stored: either a link or a stored file. */
export const resolvedAttachment = v.object({
  url: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  name: v.optional(v.string()),
  mime: v.optional(v.string()),
  size: v.optional(v.number()),
});
type Resolved = Infer<typeof resolvedAttachment>;

const EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  svg: "image/svg+xml", heic: "image/heic", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", pdf: "application/pdf", txt: "text/plain", md: "text/markdown",
  csv: "text/csv", json: "application/json", zip: "application/zip",
};
const mimeFromName = (name?: string | null) => (name ? EXT_MIME[name.split(".").pop()?.toLowerCase() ?? ""] : undefined);

export const uploadUrl = internalMutation({
  args: {},
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

export const fileInfo = internalQuery({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    const id = ctx.db.system.normalizeId("_storage", storageId);
    const f = id ? await ctx.db.system.get(id) : null;
    return f ? { id: f._id, size: f.size, contentType: f.contentType ?? null } : null;
  },
});

/** Stores inline (base64) files and checks uploaded ones, so a mutation can attach them. */
export async function resolveAttachments(ctx: ActionCtx, items: AttachmentInput[] | undefined): Promise<Resolved[]> {
  const list = items ?? [];
  if (list.length > MAX_ATTACHMENTS) throw new ConvexError(`At most ${MAX_ATTACHMENTS} attachments at once`);
  const out: Resolved[] = [];
  for (const a of list) {
    const name = a.name?.trim().slice(0, 200) || undefined;
    if (a.storageId) {
      const info = await ctx.runQuery(internal.agentFiles.fileInfo, { storageId: a.storageId });
      if (!info) throw new ConvexError(`No uploaded file with storageId ${a.storageId}. Upload it with get_upload_url first.`);
      out.push({ storageId: info.id, name, mime: a.mime ?? info.contentType ?? mimeFromName(name), size: info.size });
    } else if (a.base64) {
      let mime = a.mime;
      const b64 = a.base64.replace(/^data:([^;,]+)?(;[^,]*)?,/, (_m, t: string | undefined) => {
        mime = mime ?? t;
        return "";
      });
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
      } catch {
        throw new ConvexError("base64 isn't valid");
      }
      if (bytes.length > MAX_INLINE) throw new ConvexError("base64 files must be under 20 MB. Upload bigger ones with get_upload_url.");
      mime = mime ?? mimeFromName(name) ?? "application/octet-stream";
      const storageId = await ctx.storage.store(new Blob([bytes], { type: mime }));
      out.push({ storageId, name, mime, size: bytes.length });
    } else if (a.url) {
      out.push({ url: a.url, name });
    } else {
      throw new ConvexError("Each attachment needs a url, base64 or storageId");
    }
  }
  return out;
}

/** Turns a resolved attachment into what a comment stores. */
export async function toAttachment(ctx: MutationCtx, a: Resolved): Promise<Doc<"comments">["attachments"][number]> {
  const name = a.name?.slice(0, 200) ?? null;
  if (a.storageId) {
    const mime = a.mime ?? mimeFromName(name) ?? null;
    const kind = mime?.startsWith("image/") ? "image" : mime?.startsWith("video/") ? "video" : mime?.startsWith("audio/") ? "audio" : "file";
    return { id: crypto.randomUUID(), kind, url: await ctx.storage.getUrl(a.storageId), storageId: a.storageId, name, mime, size: a.size ?? null };
  }
  const url = (a.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) throw new ConvexError(`Attachment links must start with http:// or https:// (${url})`);
  const kind = /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url) ? "image" : /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) ? "video" : "link";
  return { id: crypto.randomUUID(), kind, url, storageId: null, name, mime: null, size: null };
}

/** Adds files to any comment. Only adds; never removes. */
export const attach = internalMutation({
  args: { comment: v.string(), attachments: v.array(resolvedAttachment) },
  handler: async (ctx, { comment, attachments }) => {
    const id = ctx.db.normalizeId("comments", comment);
    const c = id ? await ctx.db.get(id) : null;
    if (!c) throw new ConvexError("Comment not found. Pass a comment id from comment_on_script or get_script.");
    if (c.attachments.length + attachments.length > 50) throw new ConvexError("A comment can hold at most 50 files");
    const added = [];
    for (const a of attachments) added.push(await toAttachment(ctx, a));
    const now = Date.now();
    await ctx.db.patch(c._id, { attachments: [...c.attachments, ...added], updatedAt: now });
    await ctx.db.patch(c.videoId, { updatedAt: now });
    return { comment: c._id, attached: added.map((a) => ({ name: a.name, kind: a.kind, url: a.url })) };
  },
});

export async function attachFiles(ctx: ActionCtx, comment: string, items: AttachmentInput[]) {
  const attachments = await resolveAttachments(ctx, items);
  return ctx.runMutation(internal.agentFiles.attach, { comment, attachments });
}

/** Stores a raw upload (e.g. the body of POST /agent/file). */
export async function storeBlob(ctx: ActionCtx, blob: Blob): Promise<Id<"_storage">> {
  if (!blob.size) throw new ConvexError("Send the file as the request body");
  if (blob.size > MAX_INLINE) throw new ConvexError("Over 20 MB. Use get_upload_url (POST /agent/upload-url), upload there, then attach the storageId.");
  return ctx.storage.store(blob);
}
