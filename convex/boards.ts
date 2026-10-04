// Excalidraw boards: drawings kept in Native Note. The scene (Excalidraw's elements) is stored as JSON, and every save
// also writes a plain-text summary of what's on the board (its text, shapes, labels and arrows) so AI can read it.

import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib";
import { describeStyle, draw, edit, itemsOf, styleProfile, type EditOp, type Item, type Options } from "./boardDraw";

const MAX_SCENE = 900_000; // Convex documents top out at 1 MB

type El = {
  id: string;
  type: string;
  isDeleted?: boolean;
  text?: string;
  originalText?: string;
  name?: string | null;
  containerId?: string | null;
  boundElements?: { id: string; type: string }[] | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  frameId?: string | null;
  link?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

const LABEL: Record<string, string> = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  diamond: "diamond",
  arrow: "arrow",
  line: "line",
  freedraw: "drawing",
  text: "text",
  image: "image",
  frame: "frame",
  magicframe: "frame",
  embeddable: "embed",
  iframe: "embed",
};

/** Plain-text description of a board for AI: counts, all text (in reading order), labelled shapes and connections. */
export function summarize(title: string, elementsJson: string) {
  let els: El[] = [];
  try {
    els = (JSON.parse(elementsJson) as El[]).filter((e) => e && !e.isDeleted);
  } catch {
    els = [];
  }
  const byId = new Map(els.map((e) => [e.id, e]));
  const textOf = (e: El | undefined) => (e?.originalText ?? e?.text ?? "").replace(/\s+/g, " ").trim();
  // A shape's label is the text bound inside it
  const labelOf = (e: El | undefined): string => {
    if (!e) return "";
    if (e.type === "text") return textOf(e);
    const t = e.boundElements?.find((b) => b.type === "text");
    return t ? textOf(byId.get(t.id)) : e.type === "frame" || e.type === "magicframe" ? (e.name ?? "") : "";
  };
  const counts = new Map<string, number>();
  for (const e of els) if (!(e.type === "text" && e.containerId)) counts.set(LABEL[e.type] ?? e.type, (counts.get(LABEL[e.type] ?? e.type) ?? 0) + 1);
  const order = (a: El, b: El) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0);
  const freeText = els.filter((e) => e.type === "text" && !e.containerId).sort(order).map(textOf).filter(Boolean);
  const shapes = els
    .filter((e) => ["rectangle", "ellipse", "diamond", "frame", "magicframe"].includes(e.type))
    .sort(order)
    .map((e) => ({ kind: LABEL[e.type] ?? e.type, label: labelOf(e) }))
    .filter((s) => s.label);
  const arrows = els
    .filter((e) => e.type === "arrow")
    .map((e) => {
      const from = labelOf(byId.get(e.startBinding?.elementId ?? "")) || (e.startBinding ? "(unlabelled shape)" : "");
      const to = labelOf(byId.get(e.endBinding?.elementId ?? "")) || (e.endBinding ? "(unlabelled shape)" : "");
      const label = labelOf(e);
      return from || to || label ? `${from || "(unattached)"} → ${to || "(unattached)"}${label ? ` (${label})` : ""}` : "";
    })
    .filter(Boolean);
  const links = els.map((e) => e.link).filter((l): l is string => !!l);
  const lines = [
    `Board: ${title || "Untitled"}`,
    `Contents: ${[...counts].map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`).join(", ") || "empty"}`,
  ];
  if (freeText.length) lines.push("", "Text (top to bottom):", ...freeText.map((t) => `- ${t}`));
  if (shapes.length) lines.push("", "Labelled shapes:", ...shapes.map((s) => `- ${s.kind}: ${s.label}`));
  if (arrows.length) lines.push("", "Connections:", ...arrows.map((a) => `- ${a}`));
  if (links.length) lines.push("", "Links:", ...links.map((l) => `- ${l}`));
  return { summary: lines.join("\n").slice(0, 20000), elementCount: els.length };
}

const file = v.object({ id: v.string(), url: v.string(), mimeType: v.string(), storageId: v.optional(v.id("_storage")) });

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("boards").withIndex("by_updated").order("desc").collect();
    return rows.map((b) => ({ id: b._id, title: b.title, updatedAt: b.updatedAt, elementCount: b.elementCount, summary: b.summary.slice(0, 600) }));
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const boardId = ctx.db.normalizeId("boards", id);
    const b = boardId ? await ctx.db.get(boardId) : null;
    if (!b) return null;
    return { id: b._id, title: b.title, elements: b.elements, appState: b.appState, files: b.files, updatedAt: b.updatedAt };
  },
});

export const create = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, { title }) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    const t = (title ?? "").trim().slice(0, 200) || "Untitled board";
    return ctx.db.insert("boards", { title: t, elements: "[]", appState: "{}", files: [], summary: summarize(t, "[]").summary, elementCount: 0, createdBy: userId, createdAt: now, updatedAt: now });
  },
});

/** Autosave from the editor: the scene, plus the AI summary worked out from it. */
export const save = mutation({
  args: { id: v.id("boards"), title: v.optional(v.string()), elements: v.optional(v.string()), appState: v.optional(v.string()), files: v.optional(v.array(file)) },
  handler: async (ctx, { id, title, elements, appState, files }) => {
    await requireUser(ctx);
    const b = await ctx.db.get(id);
    if (!b) throw new ConvexError("This board was deleted");
    if ((elements?.length ?? 0) + (appState?.length ?? 0) > MAX_SCENE) throw new ConvexError("This board is too big to save. Split it into two boards.");
    const t = title !== undefined ? title.trim().slice(0, 200) || "Untitled board" : b.title;
    const els = elements ?? b.elements;
    const { summary, elementCount } = summarize(t, els);
    const patch: Partial<Doc<"boards">> = { title: t, elements: els, summary, elementCount, updatedAt: Date.now() };
    if (appState !== undefined) patch.appState = appState;
    if (files !== undefined) patch.files = files;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("boards") },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const b = await ctx.db.get(id);
    if (!b) return;
    for (const f of b.files) if (f.storageId) await ctx.storage.delete(f.storageId);
    await ctx.db.delete(id);
  },
});

/** A board id from an id or a /b/<id> link (null if it isn't one) */
export function boardIdOf(ctx: QueryCtx, text: string) {
  return ctx.db.normalizeId("boards", text.trim().replace(/[?#].*$/, "").split("/").filter(Boolean).pop() ?? "");
}

/** What agents see for a board block in a script: enough to understand the board without another call */
export async function boardCard(ctx: QueryCtx, text: string) {
  const id = boardIdOf(ctx, text);
  const b = id ? await ctx.db.get(id) : null;
  if (!b) return { id: text, missing: true as const, note: "This board was deleted or isn't chosen yet." };
  return { id: b._id, title: b.title, url: `${process.env.SITE_URL ?? ""}/b/${b._id}`, summary: b.summary };
}

// ---------- For agents (see agent.ts / mcp.ts) ----------

export const listForAgent = internalQuery({
  args: { query: v.optional(v.string()) },
  handler: async (ctx, { query: q }) => {
    const rows = await ctx.db.query("boards").withIndex("by_updated").order("desc").collect();
    const s = q?.trim().toLowerCase();
    return rows
      .filter((b) => !s || `${b.title}\n${b.summary}`.toLowerCase().includes(s))
      .map((b) => ({ id: b._id, title: b.title, updatedAt: new Date(b.updatedAt).toISOString(), elementCount: b.elementCount, url: `${process.env.SITE_URL ?? ""}/b/${b._id}` }));
  },
});

export const getForAgent = internalQuery({
  args: { board: v.string(), includeElements: v.optional(v.boolean()) },
  handler: async (ctx, { board, includeElements }) => {
    const id = boardIdOf(ctx, board);
    const b = id ? await ctx.db.get(id) : null;
    if (!b) throw new ConvexError("Board not found. Use list_boards for ids.");
    return {
      id: b._id as Id<"boards">,
      title: b.title,
      updatedAt: new Date(b.updatedAt).toISOString(),
      url: `${process.env.SITE_URL ?? ""}/b/${b._id}`,
      summary: b.summary,
      // How it's drawn (colors, stroke, font, sizes, spacing, direction): add_to_board copies this by default
      style: describeStyle(styleProfile(JSON.parse(b.elements))),
      // Everything on it with ids, so arrows and edits can point at things
      items: itemsOf(JSON.parse(b.elements)),
      // The raw Excalidraw elements (positions, sizes, colors, bindings), only when asked: they can be long
      ...(includeElements ? { elements: (JSON.parse(b.elements) as { isDeleted?: boolean }[]).filter((e) => !e.isDeleted) } : {}),
      images: b.files.map((f) => ({ id: f.id, url: f.url, mimeType: f.mimeType })),
    };
  },
});

// ---------- Agents drawing on boards (see boardDraw.ts) ----------

const level = v.optional(v.union(v.literal("s"), v.literal("m"), v.literal("l"), v.literal("xl")));
const num = v.optional(v.number());
export const boardItem = v.union(
  v.object({ type: v.literal("text"), id: v.optional(v.string()), text: v.string(), size: level, color: v.optional(v.string()), x: num, y: num, link: v.optional(v.string()) }),
  v.object({
    type: v.literal("shape"),
    id: v.optional(v.string()),
    shape: v.optional(v.union(v.literal("rectangle"), v.literal("ellipse"), v.literal("diamond"))),
    label: v.optional(v.string()),
    color: v.optional(v.string()),
    width: num,
    height: num,
    x: num,
    y: num,
    link: v.optional(v.string()),
  }),
  v.object({ type: v.literal("sticky"), id: v.optional(v.string()), text: v.string(), color: v.optional(v.string()), x: num, y: num }),
  v.object({ type: v.literal("arrow"), id: v.optional(v.string()), from: v.string(), to: v.string(), label: v.optional(v.string()), dashed: v.optional(v.boolean()) }),
  v.object({ type: v.literal("image"), id: v.optional(v.string()), url: v.string(), width: num, height: num, x: num, y: num }),
);
const drawOptions = {
  layout: v.optional(v.union(v.literal("auto"), v.literal("flow"), v.literal("row"), v.literal("column"), v.literal("grid"))),
  direction: v.optional(v.union(v.literal("right"), v.literal("down"))),
  placement: v.optional(v.union(v.literal("right"), v.literal("below"))),
};

/** Saves a changed scene and its new AI summary */
async function store(ctx: MutationCtx, b: Doc<"boards">, elements: unknown[], files = b.files, title = b.title) {
  const json = JSON.stringify(elements);
  if (json.length + b.appState.length > MAX_SCENE) throw new ConvexError("The board would be too big. Start a new board for this.");
  const { summary, elementCount } = summarize(title, json);
  await ctx.db.patch(b._id, { title, elements: json, files, summary, elementCount, updatedAt: Date.now() });
  return { id: b._id, url: `${process.env.SITE_URL ?? ""}/b/${b._id}`, summary };
}

async function addItems(ctx: MutationCtx, b: Doc<"boards">, items: Item[], opts: Options) {
  if (items.length > 300) throw new ConvexError("At most 300 items at once");
  for (const it of items) if ((it.type === "image" || ("link" in it && it.link)) && !/^https?:\/\//i.test(it.type === "image" ? it.url : (it as { link: string }).link)) throw new ConvexError("Links and image URLs must start with http:// or https://");
  const existing = JSON.parse(b.elements) as Parameters<typeof draw>[1];
  let res: ReturnType<typeof draw>;
  try {
    res = draw(items, existing, opts);
  } catch (e) {
    throw new ConvexError((e as Error).message);
  }
  // Nothing already there is lost: existing elements stay, a few get an arrow binding (new version)
  const changed = new Map(res.changed.map((e) => [e.id, e]));
  const elements = [...existing.map((e) => changed.get(e.id) ?? e), ...res.added];
  const saved = await store(ctx, b, elements, [...b.files, ...res.files]);
  return { ...saved, added: res.added.length, ids: res.ids, styleUsed: describeStyle(res.style) };
}

export const createForAgent = internalMutation({
  args: { title: v.string(), items: v.optional(v.array(boardItem)), ...drawOptions, agentName: v.optional(v.string()) },
  handler: async (ctx, { title, items, agentName: _a, ...opts }) => {
    const now = Date.now();
    const t = title.trim().slice(0, 200) || "Untitled board";
    // Made by an agent, not a signed-in person
    const id = await ctx.db.insert("boards", { title: t, elements: "[]", appState: "{}", files: [], summary: summarize(t, "[]").summary, elementCount: 0, createdBy: null, createdAt: now, updatedAt: now });
    const b = (await ctx.db.get(id))!;
    if (!items?.length) return { id, url: `${process.env.SITE_URL ?? ""}/b/${id}`, added: 0, ids: {} };
    return addItems(ctx, b, items as Item[], opts);
  },
});

export const addForAgent = internalMutation({
  args: { board: v.string(), items: v.array(boardItem), ...drawOptions, agentName: v.optional(v.string()) },
  handler: async (ctx, { board, items, agentName: _a, ...opts }) => {
    const id = boardIdOf(ctx, board);
    const b = id ? await ctx.db.get(id) : null;
    if (!b) throw new ConvexError("Board not found. Use list_boards for ids.");
    return addItems(ctx, b, items as Item[], opts);
  },
});

const editOp = v.union(
  v.object({ op: v.literal("setText"), id: v.string(), text: v.string() }),
  v.object({ op: v.literal("setColor"), id: v.string(), color: v.string() }),
  v.object({ op: v.literal("move"), id: v.string(), dx: v.number(), dy: v.number() }),
  v.object({ op: v.literal("delete"), id: v.string() }),
);

export const editForAgent = internalMutation({
  args: { board: v.string(), ops: v.optional(v.array(editOp)), title: v.optional(v.string()), agentName: v.optional(v.string()) },
  handler: async (ctx, { board, ops, title }) => {
    const id = boardIdOf(ctx, board);
    const b = id ? await ctx.db.get(id) : null;
    if (!b) throw new ConvexError("Board not found. Use list_boards for ids.");
    if ((ops?.length ?? 0) > 300) throw new ConvexError("At most 300 changes at once");
    let elements: unknown[];
    try {
      elements = edit(JSON.parse(b.elements), (ops ?? []) as EditOp[]);
    } catch (e) {
      throw new ConvexError((e as Error).message);
    }
    return store(ctx, b, elements, b.files, title !== undefined ? title.trim().slice(0, 200) || "Untitled board" : b.title);
  },
});
