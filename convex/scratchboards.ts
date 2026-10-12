// Scratchboards: drawings in Riley's "drawing board" style, rendered by the sketch kit (src/lib/sketchKit.ts),
// not Excalidraw. The drawing is a list of items, in drawing order (which is also the order Play draws them in):
//   {kind:"pen", pts:[[x,y],…], color?, w?}                 freehand pencil line (w = line weight, default 2.6)
//   {kind:"line", a:[x,y], b:[x,y], color?, w?, dashed?}     straight line (dashed for dividers)
//   {kind:"arrow", a:[x,y], b:[x,y], bend?, color?, w?}      relaxed curved arrow with an open head (bend -1…1)
//   {kind:"rect", x, y, width, h, r?, color?, fill?}         box; r = corner radius (rounded for UI objects)
//   {kind:"diamond", x, y, width, h, color?, fill?}          diamond
//   {kind:"ellipse", cx, cy, rx, ry, color?, fill?}          circle / ellipse
//   {kind:"poly", pts:[[x,y],…], closed?, sketch?, fill?}    any polygon (closed by default, fillable)
//   {kind:"text", style:"note"|"head"|"label"|"big", text, x, y, size?, color?, align?}
//   {kind:"badge", cx, cy, r?, text, color?}                 numbered circle, filled
//   {kind:"tick", x, y, s?}                                  green check
// fill: {color, tint?:true} (tint = the light wide hatching for big regions). Colors are hex; ink #2B2B2C default.
// Every item also has an id and a seed (so its hand-drawn wobble stays the same every time).

import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUser } from "./lib";

const MAX = 900_000;
type Item = { kind: string; text?: string; style?: string; color?: string; fill?: { color: string } };

const NAMES: Record<string, string> = {
  "#2b2b2c": "ink", "#6b6a66": "graphite", "#5b8fc7": "blue", "#e2774f": "coral", "#4f8dd6": "blue", "#9b6fc9": "violet",
  "#c96fa6": "pink", "#c28f55": "tan", "#7fa752": "green", "#e24b3f": "red", "#8e8b84": "grey", "#f6d36b": "yellow",
};
const colorName = (c?: string) => (c ? NAMES[c.toLowerCase()] ?? c : "ink");

export function summarize(title: string, json: string) {
  let items: Item[] = [];
  try {
    items = JSON.parse(json);
  } catch {}
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
  const texts = items.filter((i) => i.kind === "text" || i.kind === "badge").map((i) => `- ${i.style ?? "badge"} (${colorName(i.color)}): ${i.text}`);
  const fills = items.filter((i) => i.fill).map((i) => `${i.kind} filled ${colorName(i.fill!.color)}`);
  return [
    `Scratchboard: ${title}`,
    `Contents: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ") || "empty"}`,
    texts.length ? `\nText (drawing order):\n${texts.join("\n")}` : "",
    fills.length ? `\nFills: ${fills.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 20000);
}

const view = (b: Doc<"scratchboards">) => ({ id: b._id, title: b.title, elements: b.elements, updatedAt: b.updatedAt });

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("scratchboards").withIndex("by_updated").order("desc").collect();
    return rows.map((b) => ({ id: b._id, title: b.title, updatedAt: b.updatedAt, elements: b.elements }));
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const sid = ctx.db.normalizeId("scratchboards", id);
    const b = sid ? await ctx.db.get(sid) : null;
    return b ? view(b) : null;
  },
});

export const create = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, { title }) => {
    await requireUser(ctx);
    const now = Date.now();
    const t = (title ?? "").trim().slice(0, 200) || "Untitled scratchboard";
    return ctx.db.insert("scratchboards", { title: t, elements: "[]", summary: summarize(t, "[]"), createdBy: null, createdAt: now, updatedAt: now });
  },
});

export const save = mutation({
  args: { id: v.id("scratchboards"), title: v.optional(v.string()), elements: v.optional(v.string()) },
  handler: async (ctx, { id, title, elements }) => {
    await requireUser(ctx);
    const b = await ctx.db.get(id);
    if (!b) throw new ConvexError("This scratchboard was deleted");
    if ((elements?.length ?? 0) > MAX) throw new ConvexError("This scratchboard is too big to save");
    const t = title !== undefined ? title.trim().slice(0, 200) || "Untitled scratchboard" : b.title;
    const els = elements ?? b.elements;
    await ctx.db.patch(id, { title: t, elements: els, summary: summarize(t, els), updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("scratchboards") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    await ctx.db.delete(id);
  },
});

// ---------- For agents ----------

const link = (id: string) => `${process.env.SITE_URL ?? ""}/sb/${id}`;
const idOf = (s: string) => s.trim().replace(/[?#].*$/, "").split("/").filter(Boolean).pop() ?? "";

export const listForAgent = internalQuery({
  args: { query: v.optional(v.string()) },
  handler: async (ctx, { query: q }) => {
    const rows = await ctx.db.query("scratchboards").withIndex("by_updated").order("desc").collect();
    const s = q?.trim().toLowerCase();
    return rows.filter((b) => !s || `${b.title}\n${b.summary}`.toLowerCase().includes(s)).map((b) => ({ id: b._id, title: b.title, updatedAt: new Date(b.updatedAt).toISOString(), url: link(b._id) }));
  },
});

export const getForAgent = internalQuery({
  args: { board: v.string() },
  handler: async (ctx, { board }) => {
    const id = ctx.db.normalizeId("scratchboards", idOf(board));
    const b = id ? await ctx.db.get(id) : null;
    if (!b) throw new ConvexError("Scratchboard not found. Use list_scratchboards for ids.");
    return { id: b._id, title: b.title, url: link(b._id), summary: b.summary, items: JSON.parse(b.elements) };
  },
});

const KINDS = new Set(["pen", "line", "arrow", "rect", "diamond", "ellipse", "poly", "text", "badge", "tick"]);
function clean(items: unknown) {
  if (!Array.isArray(items)) throw new ConvexError("items must be a list");
  if (items.length > 400) throw new ConvexError("At most 400 items at once");
  return items.map((raw, i) => {
    const it = raw as Record<string, unknown>;
    if (!it || typeof it !== "object" || !KINDS.has(String(it.kind))) throw new ConvexError(`Item ${i + 1}: kind must be one of ${[...KINDS].join(", ")}`);
    return { ...it, id: typeof it.id === "string" ? it.id : crypto.randomUUID(), seed: typeof it.seed === "number" ? it.seed : Math.floor(Math.random() * 1e6) };
  });
}

export const createForAgent = internalMutation({
  args: { title: v.string(), items: v.optional(v.any()), agentName: v.optional(v.string()) },
  handler: async (ctx, { title, items, agentName }) => {
    const els = JSON.stringify(items ? clean(items) : []);
    const now = Date.now();
    const t = title.trim().slice(0, 200) || "Untitled scratchboard";
    const id = await ctx.db.insert("scratchboards", { title: t, elements: els, summary: summarize(t, els), createdBy: agentName?.slice(0, 80) || "Agent", createdAt: now, updatedAt: now });
    return { id, url: link(id) };
  },
});

export const addForAgent = internalMutation({
  args: { board: v.string(), items: v.any() },
  handler: async (ctx, { board, items }) => {
    const id = ctx.db.normalizeId("scratchboards", idOf(board));
    const b = id ? await ctx.db.get(id) : null;
    if (!b) throw new ConvexError("Scratchboard not found. Use list_scratchboards for ids.");
    const els = JSON.stringify([...JSON.parse(b.elements), ...clean(items)]);
    if (els.length > MAX) throw new ConvexError("The scratchboard would be too big");
    await ctx.db.patch(b._id, { elements: els, summary: summarize(b.title, els), updatedAt: Date.now() });
    return { id: b._id, url: link(b._id), added: Array.isArray(items) ? items.length : 0 };
  },
});
