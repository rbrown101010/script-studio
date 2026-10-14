// Per-person sidebar: the apps someone pinned there (everything else is under the Apps + menu and ⌘K)

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib";

export const apps = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db
      .query("sidebarApps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return row?.apps ?? [];
  },
});

export const setApp = mutation({
  args: { app: v.string(), pinned: v.boolean() },
  handler: async (ctx, { app, pinned }) => {
    const userId = await requireUser(ctx);
    if (app.length > 40) throw new Error("Unknown app");
    const row = await ctx.db
      .query("sidebarApps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = row?.apps ?? [];
    const apps = pinned ? (now.includes(app) ? now : [...now, app]) : now.filter((a) => a !== app);
    if (row) await ctx.db.patch(row._id, { apps });
    else await ctx.db.insert("sidebarApps", { userId, apps });
  },
});
