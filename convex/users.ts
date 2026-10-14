import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { requireUser } from "./lib";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return user ? { id: user._id, email: user.email ?? "", name: user.name ?? "" } : null;
  },
});

/** Everyone who has signed up is on the team (for assigning Todo items) */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .map((u) => ({ id: u._id, name: u.name?.trim() || u.email?.split("@")[0] || "Someone", email: u.email ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
