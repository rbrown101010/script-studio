// Brand deals: the companies we partner with (name, logo, website, free-form details).
// A script links to one through its "Partner Sponsor" detail (videos.partnerId).

import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib";

async function videosOf(ctx: QueryCtx, partnerId: Id<"partners">) {
  return ctx.db
    .query("videos")
    .withIndex("by_partner", (q) => q.eq("partnerId", partnerId))
    .collect();
}

const view = (p: Doc<"partners">) => ({
  id: p._id,
  name: p.name,
  website: p.website,
  logoUrl: p.logoUrl,
  details: p.details,
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("partners").withIndex("by_name").collect();
    return Promise.all(rows.map(async (p) => ({ ...view(p), videoCount: (await videosOf(ctx, p._id)).length })));
  },
});

export const get = query({
  args: { id: v.id("partners") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const p = await ctx.db.get(id);
    if (!p) return null;
    const videos = (await videosOf(ctx, id))
      .map((vid) => ({ id: vid._id, title: vid.title, status: vid.status, format: vid.format, liveDate: vid.liveDate, sponsored: vid.sponsored ?? "none" }))
      .sort((a, b) => (b.liveDate ?? "").localeCompare(a.liveDate ?? ""));
    return { ...view(p), videos };
  },
});

const clean = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
const siteOf = (w: string | null) => (w ? (/^https?:\/\//i.test(w) ? w : `https://${w}`) : null);
/** A logo from the website's icon when none was uploaded */
const autoLogo = (w: string | null) => {
  if (!w) return null;
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(w).hostname}&sz=256`;
  } catch {
    return null;
  }
};

export const create = mutation({
  args: { name: v.string(), website: v.optional(v.string()) },
  handler: async (ctx, { name, website }) => {
    await requireUser(ctx);
    const n = name.trim().slice(0, 100);
    if (!n) throw new ConvexError("Give the partner a name");
    const site = siteOf(clean(website));
    return ctx.db.insert("partners", { name: n, website: site, logoUrl: autoLogo(site), logoStorageId: null, details: "", createdAt: Date.now() });
  },
});

export const update = mutation({
  args: { id: v.id("partners"), name: v.optional(v.string()), website: v.optional(v.string()), details: v.optional(v.string()) },
  handler: async (ctx, { id, name, website, details }) => {
    await requireUser(ctx);
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError("Partner not found");
    const patch: Partial<Doc<"partners">> = {};
    if (name !== undefined) {
      if (!name.trim()) throw new ConvexError("The name can't be empty");
      patch.name = name.trim().slice(0, 100);
    }
    if (website !== undefined) {
      patch.website = siteOf(clean(website));
      // Keep an uploaded logo; otherwise follow the new website
      if (!p.logoStorageId) patch.logoUrl = autoLogo(patch.website);
    }
    if (details !== undefined) patch.details = details.slice(0, 20000);
    await ctx.db.patch(id, patch);
  },
});

export const setLogo = mutation({
  args: { id: v.id("partners"), storageId: v.id("_storage") },
  handler: async (ctx, { id, storageId }) => {
    await requireUser(ctx);
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError("Partner not found");
    const url = await ctx.storage.getUrl(storageId);
    if (p.logoStorageId) await ctx.storage.delete(p.logoStorageId);
    await ctx.db.patch(id, { logoStorageId: storageId, logoUrl: url });
  },
});

/** Deletes a partner; its scripts just lose the Partner Sponsor (nothing else changes). */
export const remove = mutation({
  args: { id: v.id("partners") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const p = await ctx.db.get(id);
    if (!p) return;
    for (const vid of await videosOf(ctx, id)) await ctx.db.patch(vid._id, { partnerId: null });
    if (p.logoStorageId) await ctx.storage.delete(p.logoStorageId);
    await ctx.db.delete(id);
  },
});
